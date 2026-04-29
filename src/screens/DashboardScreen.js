import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  SafeAreaView,
  StatusBar,
  ActivityIndicator,
  RefreshControl,
  FlatList,
  Alert,
  Modal,
  Image,
  Animated,
  Dimensions,
  Platform,
  TextInput,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect } from '@react-navigation/native';
import { fetchReport1, fetchReport2, fetchReport3, fetchReport4, fetchOrders, deleteOrder, fetchOrderDetails } from '../services/api';
import { Linking } from 'react-native';
import ReportCard from '../components/ReportCard';
import Icon from '../components/Icon';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system';

const REPORT_COLORS = ['#0056b3', '#009688', '#ff9800', '#e91e63'];

export default function DashboardScreen({ navigation }) {
  const [reports, setReports] = useState([
    { title: 'Total Sales', value: '0', icon: '💰', loading: true },
    { title: 'Active Parties', value: '0', icon: '👥', loading: true },
    { title: 'Pending Orders', value: '0', icon: '⏳', loading: true },
    { title: 'Delivery Today', value: '0', icon: '🚚', loading: true },
  ]);
  const [recentOrders, setRecentOrders] = useState([]);
  const [userName, setUserName] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [viewModalVisible, setViewModalVisible] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [menuVisible, setMenuVisible] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [pdfLoading, setPdfLoading] = useState(false);
  const [waLoading, setWaLoading] = useState(false);
  
  // Animation for side menu
  const drawerWidth = Dimensions.get('window').width * 0.75;
  const slideAnim = React.useRef(new Animated.Value(-drawerWidth)).current;

  const toggleMenu = (show) => {
    if (show) {
      setMenuVisible(true);
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 300,
        useNativeDriver: true,
      }).start();
    } else {
      Animated.timing(slideAnim, {
        toValue: -drawerWidth,
        duration: 250,
        useNativeDriver: true,
      }).start(() => setMenuVisible(false));
    }
  };

  useEffect(() => {
    navigation.setOptions({
      headerLeft: () => (
        <TouchableOpacity 
          style={{ marginLeft: 15 }} 
          onPress={() => toggleMenu(true)}
        >
          <Icon name="list" size={24} color="#fff" />
        </TouchableOpacity>
      ),
    });
  }, [navigation]);

  const handleDelete = (orderId) => {
    Alert.alert('Delete Order', `Are you sure you want to delete order ${orderId}?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
        try {
          setActionLoading(true);
          await deleteOrder(orderId);
          await fetchAllData();
        } catch (err) {
          Alert.alert('Error', 'Failed to delete order');
        } finally {
          setActionLoading(false);
        }
      }}
    ]);
  };

  const handleView = async (orderId) => {
    try {
      setActionLoading(true);
      const data = await fetchOrderDetails(orderId);
      if (data && data.success) {
        setSelectedOrder(data.data);
        setViewModalVisible(true);
      }
    } catch (err) {
      Alert.alert('Error', 'Failed to fetch order details');
    } finally {
      setActionLoading(false);
    }
  };

  // ── builds the HTML string for any order ────────────────────────────────
  const buildOrderHTML = (order) => {
    const totalAmount = (() => {
      const amt = parseFloat(order.TotalAmount);
      if (!isNaN(amt) && amt > 0) return amt.toFixed(2);
      return (order.products || []).reduce((sum, p) => sum + parseFloat(p.TotalPrice || 0), 0).toFixed(2);
    })();
    const totalQty = (order.products || []).reduce((sum, p) => sum + (parseFloat(p.Quantity) || 0), 0);
    const orderDate = new Date(order.OrderDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' });
    const orderNo = String(order.OrderID).padStart(10, '0');

    const itemRows = (order.products || []).map((p, i) => {
      const discPct = parseFloat(p.Discount || 0);
      const qty = parseFloat(p.Quantity || 0);
      const rate = parseFloat(p.UnitPrice || 0);
      const discAmt = qty * rate * (discPct / 100);
      const netAmt = parseFloat(p.TotalPrice || (qty * rate - discAmt) || 0);
      const discCell = discPct > 0
        ? `<span style="color:#16a34a;font-weight:700">${discPct.toFixed(0)}%</span><br/><span style="color:#6b7280;font-size:10px">(\u20b9${discAmt.toFixed(0)})</span>`
        : `<span style="color:#d1d5db">-</span>`;
      return `
        <tr style="background:${i % 2 === 0 ? '#ffffff' : '#f8fafc'}">
          <td style="padding:9px 10px;font-size:12px;color:#374151;border-bottom:1px solid #e5e7eb;font-weight:600">${p.ItemCode || ''}</td>
          <td style="padding:9px 10px;font-size:12px;color:#111827;font-weight:700;border-bottom:1px solid #e5e7eb">${p.ProductName || ''}</td>
          <td style="padding:9px 10px;font-size:12px;text-align:center;border-bottom:1px solid #e5e7eb;font-weight:600">${qty}</td>
          <td style="padding:9px 10px;font-size:12px;text-align:right;border-bottom:1px solid #e5e7eb">\u20b9${rate.toFixed(0)}</td>
          <td style="padding:9px 10px;font-size:12px;text-align:center;border-bottom:1px solid #e5e7eb">${discCell}</td>
          <td style="padding:9px 10px;font-size:13px;text-align:right;border-bottom:1px solid #e5e7eb;font-weight:800;color:#1e3a8a">\u20b9${netAmt.toFixed(0)}</td>
          <td style="padding:9px 10px;font-size:11px;color:#6b7280;border-bottom:1px solid #e5e7eb">${p.Description || ''}</td>
        </tr>`;
    }).join('');

    return `<!DOCTYPE html><html><head><meta charset="utf-8"/>
    <style>
      * { margin:0; padding:0; box-sizing:border-box; }
      body { font-family:'Helvetica Neue',Helvetica,Arial,sans-serif; background:#f1f5f9; color:#111827; }
      .page { max-width:800px; margin:0 auto; background:#fff; }
      .header { background:linear-gradient(135deg,#0056b3,#003d82); color:#fff; padding:32px 36px 24px; }
      .header-top { display:flex; justify-content:space-between; align-items:flex-start; }
      .company-name { font-size:22px; font-weight:800; letter-spacing:1px; }
      .order-badge { background:rgba(255,255,255,0.18); border:1px solid rgba(255,255,255,0.35); border-radius:8px; padding:8px 16px; text-align:right; }
      .order-badge .label { font-size:10px; opacity:0.75; letter-spacing:1px; text-transform:uppercase; }
      .order-badge .value { font-size:15px; font-weight:800; letter-spacing:1px; }
      .header-divider { height:1px; background:rgba(255,255,255,0.2); margin:18px 0; }
      .header-meta { display:flex; gap:32px; flex-wrap:wrap; }
      .meta-item .meta-label { font-size:10px; opacity:0.65; text-transform:uppercase; letter-spacing:0.8px; }
      .meta-item .meta-value { font-size:13px; font-weight:700; margin-top:2px; }
      .body { padding:28px 36px; }
      .info-grid { display:grid; grid-template-columns:1fr 1fr; gap:16px; margin-bottom:28px; }
      .info-card { background:#f8fafc; border:1px solid #e2e8f0; border-radius:10px; padding:16px 18px; }
      .info-card .card-title { font-size:10px; color:#64748b; text-transform:uppercase; letter-spacing:0.8px; font-weight:700; margin-bottom:8px; }
      .info-card .card-value { font-size:14px; color:#1e293b; font-weight:700; }
      .info-card .card-sub { font-size:12px; color:#64748b; margin-top:3px; }
      .section-title { font-size:13px; font-weight:800; color:#0056b3; text-transform:uppercase; letter-spacing:1px; margin-bottom:14px; padding-bottom:8px; border-bottom:2px solid #dbeafe; }
      table { width:100%; border-collapse:collapse; margin-bottom:24px; }
      thead tr { background:#0056b3; }
      thead th { padding:11px 10px; font-size:11px; color:#fff; font-weight:700; text-transform:uppercase; letter-spacing:0.5px; }
      thead th:nth-child(3) { text-align:center; }
      thead th:nth-child(4),thead th:nth-child(6) { text-align:right; }
      thead th:nth-child(5) { text-align:center; }
      .totals-row { background:#eff6ff; border-top:2px solid #0056b3; }
      .totals-row td { padding:12px 10px; font-weight:800; font-size:14px; }
      .notes-box { background:#fffbeb; border:1px solid #fcd34d; border-radius:10px; padding:16px 18px; margin-bottom:24px; }
      .notes-box .notes-title { font-size:11px; color:#92400e; font-weight:800; text-transform:uppercase; letter-spacing:0.8px; margin-bottom:8px; }
      .notes-box .notes-text { font-size:13px; color:#78350f; line-height:1.6; }
      .footer { background:#f8fafc; border-top:1px solid #e2e8f0; padding:18px 36px; display:flex; justify-content:space-between; align-items:center; }
      .footer-note { font-size:11px; color:#94a3b8; }
      .total-highlight { background:#0056b3; color:#fff; border-radius:10px; padding:16px 20px; display:flex; justify-content:space-between; align-items:center; margin-bottom:24px; }
      .total-highlight .tl { font-size:13px; opacity:0.85; font-weight:600; }
      .total-highlight .tv { font-size:22px; font-weight:800; }
    </style></head><body>
    <div class="page">
      <div class="header">
        <div class="header-top">
          <div>
            <div class="company-name">SALE ORDER</div>
            <div style="font-size:13px;opacity:0.8;margin-top:4px">${order.CustomerName}</div>
          </div>
          <div class="order-badge">
            <div class="label">Order No.</div>
            <div class="value">#${orderNo}</div>
          </div>
        </div>
        <div class="header-divider"></div>
        <div class="header-meta">
          <div class="meta-item"><div class="meta-label">Order Date</div><div class="meta-value">${orderDate}</div></div>
          <div class="meta-item"><div class="meta-label">Total Items</div><div class="meta-value">${(order.products||[]).length} Products</div></div>
          <div class="meta-item"><div class="meta-label">Total Qty</div><div class="meta-value">${totalQty} Units</div></div>
          ${order.SalesmanName && order.SalesmanName !== 'Missing Name' ? `<div class="meta-item"><div class="meta-label">Salesman</div><div class="meta-value">${order.SalesmanName}</div></div>` : ''}
        </div>
      </div>
      <div class="body">
        <div class="info-grid">
          <div class="info-card">
            <div class="card-title">&#128101; Party / Customer</div>
            <div class="card-value">${order.CustomerName}</div>
            ${order.Place ? `<div class="card-sub">&#128205; ${order.Place}</div>` : ''}
          </div>
          <div class="info-card">
            <div class="card-title">&#128665; Transport / Shipping</div>
            <div class="card-value">${order.Transport || 'Not specified'}</div>
          </div>
        </div>
        <div class="section-title">&#128230; Ordered Items</div>
        <table>
          <thead><tr>
            <th style="text-align:left">Code</th>
            <th style="text-align:left">Product Name</th>
            <th style="text-align:center">Qty</th>
            <th style="text-align:right">Rate</th>
            <th style="text-align:center">Disc</th>
            <th style="text-align:right">Amount</th>
            <th style="text-align:left">Remark</th>
          </tr></thead>
          <tbody>
            ${itemRows}
            <tr class="totals-row">
              <td colspan="2" style="color:#1e3a8a">TOTAL</td>
              <td style="text-align:center;color:#1e3a8a">${totalQty}</td>
              <td></td><td></td>
              <td style="text-align:right;color:#1e3a8a;font-size:15px">&#8377;${totalAmount}</td>
              <td></td>
            </tr>
          </tbody>
        </table>
        <div class="total-highlight">
          <div class="tl">Grand Total Amount</div>
          <div class="tv">&#8377; ${totalAmount}</div>
        </div>
        <div class="notes-box">
          <div class="notes-title">&#128221; Special Notes / Instructions</div>
          <div class="notes-text">${order.Notes || '-'}</div>
        </div>
      </div>
      <div class="footer">
        <div class="footer-note">This is a computer generated sale order.</div>
        <div class="footer-note">Order #${orderNo} &bull; ${orderDate}</div>
      </div>
    </div>
    </body></html>`;
  };

  // ── Download PDF → saves to app documents dir then opens share/save sheet ──
  const generateOrderPDF = async (order) => {
    try {
      setPdfLoading(true);
      const orderNo = String(order.OrderID).padStart(10, '0');
      const html = buildOrderHTML(order);
      const { uri } = await Print.printToFileAsync({ html, base64: false });

      // Copy to a named file in documentDirectory so filename is readable
      const destPath = `${FileSystem.documentDirectory}Order_${orderNo}_${order.CustomerName.replace(/[^a-zA-Z0-9]/g, '_')}.pdf`;
      await FileSystem.copyAsync({ from: uri, to: destPath });

      const canShare = await Sharing.isAvailableAsync();
      if (canShare) {
        // Opens Android share sheet → user can pick Save to Downloads / Files
        await Sharing.shareAsync(destPath, {
          mimeType: 'application/pdf',
          dialogTitle: `Save Order #${orderNo}`,
          UTI: 'com.adobe.pdf',
        });
      } else {
        Alert.alert('PDF Saved', `Saved as: Order_${orderNo}.pdf`);
      }
    } catch (err) {
      console.error('PDF Download Error:', err);
      Alert.alert('Error', 'Failed to generate PDF. Please try again.');
    } finally {
      setPdfLoading(false);
    }
  };

  // ── WhatsApp: generate PDF and send directly via WhatsApp ─────────────────
  const handleWhatsAppPDF = async (order) => {
    try {
      setWaLoading(true);
      const orderNo = String(order.OrderID).padStart(10, '0');
      const html = buildOrderHTML(order);
      const { uri } = await Print.printToFileAsync({ html, base64: false });
      const destPath = `${FileSystem.documentDirectory}Order_${orderNo}_WA.pdf`;
      await FileSystem.copyAsync({ from: uri, to: destPath });

      // Get content URI for Android sharing intent (needed for WhatsApp)
      let shareUri = destPath;
      try {
        shareUri = await FileSystem.getContentUriAsync(destPath);
      } catch (_) { /* fallback to file URI */ }

      const canShare = await Sharing.isAvailableAsync();
      if (canShare) {
        await Sharing.shareAsync(shareUri, {
          mimeType: 'application/pdf',
          dialogTitle: `Share Order #${orderNo} via WhatsApp`,
          UTI: 'com.adobe.pdf',
        });
      } else {
        Alert.alert('Error', 'Sharing not available on this device.');
      }
    } catch (err) {
      console.error('WhatsApp PDF Error:', err);
      Alert.alert('Error', 'Failed to share PDF. Please try again.');
    } finally {
      setWaLoading(false);
    }
  };

  const loadUserName = async () => {
    try {
      const info = await AsyncStorage.getItem('userInfo');
      if (info) {
        const parsed = JSON.parse(info);
        setUserName(parsed.userName || parsed.userId || '');
      }
    } catch (e) {
      console.error('Failed to load user info');
    }
  };

  const fetchAllData = async () => {
    const fetchers = [fetchReport1, fetchReport2, fetchReport3, fetchReport4];
    
    // Reset loading state for fresh fetch
    setReports(prev => prev.map(r => ({ ...r, loading: true })));

    // Fetch reports
    const reportPromises = fetchers.map(async (func, idx) => {
      try {
        const data = await func();
        setReports(prev => {
          const updated = [...prev];
          updated[idx] = { ...updated[idx], value: data.value || '0', loading: false };
          return updated;
        });
      } catch (err) {
        setReports(prev => {
          const updated = [...prev];
          updated[idx] = { ...updated[idx], error: true, loading: false };
          return updated;
        });
      }
    });

    // Fetch orders
    const orderPromise = (async () => {
      try {
        const res = await fetchOrders();
        if (res && res.success && Array.isArray(res.data)) {
          setRecentOrders(res.data);
        } else if (Array.isArray(res)) {
          setRecentOrders(res);
        } else {
          setRecentOrders([]);
        }
      } catch (err) {
        console.error('Failed to fetch orders:', err);
      }
    })();

    await Promise.all([...reportPromises, orderPromise]);
  };

  // Refresh data whenever screen comes into focus
  useFocusEffect(
    useCallback(() => {
      loadUserName();
      fetchAllData();
    }, [])
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchAllData();
    setRefreshing(false);
  }, []);

  const handleLogout = async () => {
    await AsyncStorage.removeItem('userToken');
    await AsyncStorage.removeItem('userInfo');
    navigation.replace('Login');
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#0056b3" />
      
      {/* Top Bar */}
      <View style={styles.topBar}>
        <View>
          <Text style={styles.greeting}>Hello, {String(userName || 'User')} 👋</Text>
          <Text style={styles.subGreeting}>Here's your overview</Text>
        </View>
        <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout}>
          <Image 
            source={require('../../assets/icons/logout.png')} 
            style={styles.logoutIcon}
            resizeMode="contain"
          />
        </TouchableOpacity>
      </View>

      <ScrollView 
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#0056b3']} />}
      >
        {/* Recent Orders Section */}
        <View style={styles.ordersSection}>
          <Text style={styles.sectionTitle}>Recent Orders</Text>

          {/* Search Bar */}
          <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#f0f4f8', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, marginBottom: 10 }}>
            <Text style={{ fontSize: 14, marginRight: 8, color: '#90a4ae' }}>🔍</Text>
            <TextInput
              style={{ flex: 1, fontSize: 14, color: '#263238', padding: 0 }}
              placeholder="Search by party or order no..."
              placeholderTextColor="#90a4ae"
              value={searchText}
              onChangeText={setSearchText}
            />
            {searchText.length > 0 && (
              <TouchableOpacity onPress={() => setSearchText('')}>
                <Text style={{ fontSize: 16, color: '#90a4ae' }}>✕</Text>
              </TouchableOpacity>
            )}
          </View>

          {recentOrders.filter(o =>
            !searchText ||
            (o.CustomerName || '').toLowerCase().includes(searchText.toLowerCase()) ||
            String(o.SaleOrderNo || '').includes(searchText)
          ).length > 0 ? (
            recentOrders.filter(o =>
              !searchText ||
              (o.CustomerName || '').toLowerCase().includes(searchText.toLowerCase()) ||
              String(o.SaleOrderNo || '').includes(searchText)
            ).map((order) => (
              <TouchableOpacity 
                key={order.OrderID || Math.random().toString()} 
                style={styles.premiumOrderCard}
                activeOpacity={0.8}
                onPress={() => handleView(order.OrderID)}
              >
                {/* Row 1: Customer and QTY */}
                <View style={styles.orderCardTop}>
                  <Text style={styles.premiumCustomerName} numberOfLines={1}>
                    {order.CustomerName || 'Walk-in'}
                  </Text>
                  <View style={styles.balQtyBadge}>
                    <Text style={styles.balQtyText}>QTY {order.Qty || order.BalQty || 0}</Text>
                  </View>
                </View>

                {/* Row 2: ID and Date */}
                <View style={styles.orderCardBottom}>
                  <View style={styles.idContainer}>
                    <Icon name="order" size={12} color="#94a3b8" />
                    <Text style={styles.premiumOrderId}>
                      ORDER: {order.SaleOrderNo ? order.SaleOrderNo : String(order.OrderID).padStart(10, '0')}
                    </Text>
                  </View>
                  <Text style={styles.premiumOrderDate}>
                    {order.OrderDate || 'N/A'}
                  </Text>
                </View>
              </TouchableOpacity>
            ))
          ) : (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyText}>{searchText ? 'No orders match your search' : 'No pending orders found'}</Text>
            </View>
          )}
        </View>

      </ScrollView>

      {/* Action Button */}
      <TouchableOpacity 
        style={styles.fab}
        onPress={() => navigation.navigate('CreateOrder')}
      >
        <Text style={styles.fabIcon}>+</Text>
        <Text style={styles.fabText}>Create Order</Text>
      </TouchableOpacity>

      {/* Premium View Order Modal (Image 2 style) */}
      <Modal 
        visible={viewModalVisible} 
        animationType="slide" 
        transparent={false} 
        onRequestClose={() => setViewModalVisible(false)}
      >
        <View style={styles.detailContainer}>
          {/* Black Header */}
          <View style={styles.detailHeader}>
            <TouchableOpacity onPress={() => setViewModalVisible(false)} style={styles.detailBackBtn}>
              <Icon name="back" size={24} color="#fff" />
            </TouchableOpacity>
            <Text style={styles.detailHeaderTitle} numberOfLines={1}>
              {selectedOrder?.CustomerName}
            </Text>
            <View style={{ width: 40 }} />
          </View>

          {selectedOrder && (
            <ScrollView style={styles.detailScroll} contentContainerStyle={styles.detailScrollContent}>
              {/* Summary Card */}
              <View style={styles.detailSummaryCard}>
                <View style={styles.summaryTop}>
                  <View>
                    <Text style={styles.summaryOrderId}>#{String(selectedOrder.OrderID).padStart(10, '0')}</Text>
                    <Text style={styles.summaryCustomer}>{selectedOrder.CustomerName}</Text>
                  </View>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 20 }}>
                    <TouchableOpacity 
                      style={{ padding: 4 }}
                      onPress={() => {
                        setViewModalVisible(false);
                        navigation.navigate('CreateOrder', { editOrder: selectedOrder });
                      }}
                    >
                      <Text style={{ fontSize: 22 }}>✏️</Text>
                    </TouchableOpacity>
                    <TouchableOpacity 
                      style={{ padding: 4 }}
                      disabled={pdfLoading}
                      onPress={() => generateOrderPDF(selectedOrder)}
                    >
                      {pdfLoading
                        ? <ActivityIndicator size="small" color="#0056b3" />
                        : <Image source={require('../../assets/icons/shared.png')} style={{ width: 22, height: 22, resizeMode: 'contain' }} />
                      }
                    </TouchableOpacity>
                  </View>
                </View>

                <View style={styles.summaryPriceSection}>
                  <Text style={styles.summaryPriceLabel}>Total Amount</Text>
                  <Text style={styles.summaryPriceValue}>
                    Rs. {(() => {
                      const amt = parseFloat(selectedOrder.TotalAmount);
                      if (!isNaN(amt) && amt > 0) return amt.toFixed(0);
                      
                      // Fallback: calculate from items
                      const calculated = (selectedOrder.products || []).reduce((sum, p) => {
                        const val = parseFloat(p.TotalPrice || (p.Quantity * p.UnitPrice) || 0);
                        return sum + (isNaN(val) ? 0 : val);
                      }, 0);
                      return calculated.toFixed(0);
                    })()}
                  </Text>
                </View>

                <View style={styles.summaryMetaRow}>
                  <View style={styles.detailQtyBadge}>
                    <Text style={styles.detailQtyText}>QTY {selectedOrder.products?.reduce((sum, p) => sum + (p.Quantity || 0), 0)}</Text>
                  </View>
                  <Text style={styles.summaryDate}>
                    {new Date(selectedOrder.OrderDate).toLocaleDateString('en-GB')}
                  </Text>
                </View>
              </View>

              {/* Transport Section */}
              <View style={styles.transportSection}>
                <View style={[styles.detailIconBox, { backgroundColor: '#f0f9ff' }]}>
                  <Icon name="transport" size={18} color="#0369a1" />
                </View>
                <View style={{ flex: 1, marginLeft: 12 }}>
                  <Text style={styles.transportTitle}>Transport / Shipping</Text>
                  <Text style={styles.transportText}>
                    {selectedOrder.Transport || 'No transport details mentioned.'}
                  </Text>
                </View>
              </View>

              {/* Special Notes Section */}
              <View style={styles.transportSection}>
                <View style={[styles.detailIconBox, { backgroundColor: '#f0f9ff' }]}>
                  <Text style={{ fontSize: 16 }}>📝</Text>
                </View>
                <View style={{ flex: 1, marginLeft: 12 }}>
                  <Text style={styles.transportTitle}>Special Notes</Text>
                  <Text style={styles.transportText}>
                    {selectedOrder.Notes || '-'}
                  </Text>
                </View>
              </View>

              <View style={styles.detailProductsHead}>
                <Text style={styles.detailSectionTitle}>ORDERED ITEMS</Text>
                <Text style={styles.itemCountText}>{selectedOrder.products?.length} Items</Text>
              </View>

              {/* Items Table Header */}
              <View style={styles.itemsTableHeader}>
                <Text style={[styles.tableHeadText, { flex: 0.18 }]}>CODE</Text>
                <Text style={[styles.tableHeadText, { flex: 0.28 }]}>NAME</Text>
                <Text style={[styles.tableHeadText, { flex: 0.12, textAlign: 'center' }]}>QTY</Text>
                <Text style={[styles.tableHeadText, { flex: 0.14, textAlign: 'right' }]}>RATE</Text>
                <Text style={[styles.tableHeadText, { flex: 0.13, textAlign: 'right' }]}>DISC</Text>
                <Text style={[styles.tableHeadText, { flex: 0.15, textAlign: 'right' }]}>AMT</Text>
              </View>

              {selectedOrder.products?.map((p, idx) => (
                <View key={idx} style={styles.itemTableRow}>
                   <Text style={[styles.tableCellText, { flex: 0.18, fontWeight: '700' }]} numberOfLines={1}>{p.ItemCode}</Text>
                   <Text style={[styles.tableCellText, { flex: 0.28, fontWeight: '700' }]} numberOfLines={2}>{p.ProductName}</Text>
                   <Text style={[styles.tableCellText, { flex: 0.12, textAlign: 'center' }]}>{p.Quantity}</Text>
                   <Text style={[styles.tableCellText, { flex: 0.14, textAlign: 'right' }]}>{parseFloat(p.UnitPrice).toFixed(0)}</Text>
                   <Text style={[styles.tableCellText, { flex: 0.13, textAlign: 'right', color: '#2e7d32' }]}>
                     {p.Discount > 0 ? `${parseFloat(p.Discount).toFixed(0)}%` : '-'}
                   </Text>
                   <Text style={[styles.tableCellText, { flex: 0.15, textAlign: 'right', fontWeight: '800' }]}>{parseFloat(p.TotalPrice).toFixed(0)}</Text>
                </View>
              ))}

              <View style={{ height: 40 }} />
            </ScrollView>
          )}

          {/* WhatsApp sharing footer — disabled for now, keep for future use */}
          {/* <View style={styles.detailFooter}>
            <TouchableOpacity 
              style={styles.whatsappBtn}
              disabled={waLoading}
              onPress={() => handleWhatsAppPDF(selectedOrder)}
            >
              {waLoading
                ? <ActivityIndicator size="small" color="#fff" style={{ marginRight: 8 }} />
                : <Text style={{ fontSize: 20, marginRight: 8 }}>💬</Text>
              }
              <Text style={styles.whatsappBtnText}>Share PDF via WhatsApp</Text>
            </TouchableOpacity>
          </View> */}
        </View>
      </Modal>

      {actionLoading && (
        <View style={styles.loadingOverlay}><ActivityIndicator size="large" color="#0056b3" /></View>
      )}

      {/* Reports Menu Modal */}
      <Modal
        visible={menuVisible}
        transparent={true}
        animationType="none"
        onRequestClose={() => toggleMenu(false)}
      >
        <View style={styles.menuContainer}>
          <TouchableOpacity 
            style={styles.menuOverlay} 
            activeOpacity={1} 
            onPress={() => toggleMenu(false)}
          />
          <Animated.View 
            style={[
              styles.menuContent, 
              { 
                width: drawerWidth,
                transform: [{ translateX: slideAnim }] 
              }
            ]}
          >
            <SafeAreaView style={{ flex: 1 }}>
              <View style={styles.menuHeader}>
                <View>
                  <Text style={styles.menuTitle}>Reports & Analytics</Text>
                  <Text style={styles.menuSubTitle}>Management Overview</Text>
                </View>
                <TouchableOpacity onPress={() => toggleMenu(false)} style={styles.closeBtnSmall}>
                  <Text style={styles.closeText}>✕</Text>
                </TouchableOpacity>
              </View>
              
              <View style={styles.menuList}>
                <TouchableOpacity style={styles.menuItem} onPress={() => { toggleMenu(false); navigation.navigate('PendingReport'); }}>
                  <View style={[styles.menuIconBox, { backgroundColor: '#e3f2fd' }]}>
                    <Icon name="reports" size={20} color="#0056b3" />
                  </View>
                  <Text style={styles.menuItemText}>Pending Reports</Text>
                </TouchableOpacity>
                
                <TouchableOpacity style={styles.menuItem} onPress={() => { toggleMenu(false); Alert.alert("Dispatch Report", "Detailed dispatch tracking."); }}>
                  <View style={[styles.menuIconBox, { backgroundColor: '#e0f2f1' }]}>
                    <Icon name="transport" size={20} color="#009688" />
                  </View>
                  <Text style={styles.menuItemText}>Dispatch Report</Text>
                </TouchableOpacity>
                
                <TouchableOpacity style={styles.menuItem} onPress={() => { toggleMenu(false); Alert.alert("Stock Report", "Inventory status dashboard."); }}>
                  <View style={[styles.menuIconBox, { backgroundColor: '#fff3e0' }]}>
                    <Icon name="product" size={20} color="#ff9800" />
                  </View>
                  <Text style={styles.menuItemText}>Stock Report</Text>
                </TouchableOpacity>
                
                <TouchableOpacity style={styles.menuItem} onPress={() => { toggleMenu(false); Alert.alert("Supplier Against Report", "Supplier analytics."); }}>
                  <View style={[styles.menuIconBox, { backgroundColor: '#fce4ec' }]}>
                    <Icon name="party" size={20} color="#e91e63" />
                  </View>
                  <Text style={styles.menuItemText}>Supplier Against Report</Text>
                </TouchableOpacity>
              </View>

              <View style={styles.menuFooter}>
                <Text style={styles.footerText}>© 2024 Order Manager Pro</Text>
                <Text style={styles.footerSub}>v1.0.2</Text>
              </View>
            </SafeAreaView>
          </Animated.View>
        </View>
      </Modal>

    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f7fa',
  },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 25,
    backgroundColor: '#0056b3',
    borderBottomLeftRadius: 30,
    borderBottomRightRadius: 30,
  },
  greeting: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#fff',
  },
  subGreeting: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.7)',
    marginTop: 2,
  },
  logoutBtn: {
    padding: 8,
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 12,
  },
  logoutIcon: {
    width: 22,
    height: 22,
    tintColor: '#fff',
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 100,
  },
  reportGrid: {
    marginBottom: 24,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 15,
  },
  ordersSection: {
    marginTop: 10,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 15,
  },
  orderCard: {
    flexDirection: 'column',
    justifyContent: 'space-between',
    backgroundColor: '#fff',
    borderRadius: 15,
    padding: 15,
    marginBottom: 12,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  orderInfo: {
    flex: 1,
  },
  orderCustomer: {
    fontSize: 16,
    fontWeight: '600',
    color: '#2c3e50',
  },
  orderDate: {
    fontSize: 12,
    color: '#95a5a6',
    marginTop: 4,
  },
  orderAmount: {
    alignItems: 'flex-end',
  },
  orderValue: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#1a237e',
  },
  orderStatus: {
    fontSize: 12,
    fontWeight: '600',
    marginTop: 4,
  },
  emptyCard: {
    padding: 40,
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 15,
  },
  emptyText: {
    color: '#95a5a6',
    fontStyle: 'italic',
  },
  fab: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0056b3',
    height: 55,
    borderRadius: 15,
    position: 'absolute',
    bottom: 30,
    left: 20,
    right: 20,
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
  },
  fabIcon: {
    color: '#fff',
    fontSize: 24,
    fontWeight: 'bold',
    marginRight: 10,
  },
  fabText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  orderHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', width: '100%' },
  orderTapHint: { borderTopWidth: 1, borderTopColor: '#f0f2f5', paddingTop: 8, marginTop: 10, alignItems: 'flex-end' },
  tapHintText: { fontSize: 11, color: '#0056b3', fontWeight: '500' },
  orderIdText: { fontSize: 11, color: '#b0bec5', marginTop: 2 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  viewModalContent: { backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, height: '42%', minHeight: '32%', maxHeight: '48%' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, borderBottomWidth: 1, borderBottomColor: '#f0f2f5', paddingBottom: 15 },
  modalTitle: { fontSize: 18, fontWeight: 'bold', color: '#0056b3' },
  closeText: { color: '#e91e63', fontWeight: 'bold', fontSize: 15 },
  modalScroll: { width: '100%' },
  detailRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 },
  detailLabel: { fontSize: 14, color: '#78909c' },
  detailValue: { fontSize: 14, fontWeight: '600', color: '#2c3e50' },
  productItem: { backgroundColor: '#f8fafc', padding: 12, borderRadius: 8, marginBottom: 8 },
  productName: { fontSize: 14, fontWeight: 'bold', color: '#2c3e50', marginBottom: 6 },
  productDetailsRow: { flexDirection: 'row', justifyContent: 'space-between' },
  productQty: { fontSize: 13, color: '#78909c' },
  productTotal: { fontSize: 13, fontWeight: 'bold', color: '#1565C0' },
  loadingOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(255,255,255,0.7)', justifyContent: 'center', alignItems: 'center', zIndex: 1000 },
  
  // Menu Drawer Styles improvements
  menuContainer: {
    flex: 1,
    flexDirection: 'row',
  },
  menuOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  menuContent: {
    height: '100%',
    backgroundColor: '#fff',
    borderTopRightRadius: 20,
    borderBottomRightRadius: 20,
    shadowColor: '#000',
    shadowOffset: { width: 4, height: 0 },
    shadowOpacity: 0.1,
    shadowRadius: 10,
    elevation: 16,
  },
  menuHeader: {
    padding: 24,
    paddingTop: 40,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f2f5',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  menuTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#0056b3',
  },
  menuSubTitle: {
    fontSize: 12,
    color: '#94a3b8',
    marginTop: 4,
  },
  menuList: {
    padding: 12,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    marginBottom: 8,
    borderRadius: 12,
  },
  menuIconBox: {
    width: 40,
    height: 40,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  menuItemText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#334155',
    marginLeft: 16,
  },
  closeBtnSmall: {
    padding: 4,
  },
  menuFooter: {
    position: 'absolute',
    bottom: 30,
    left: 0,
    right: 0,
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
    paddingTop: 20,
  },
  footerText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748b',
  },
  footerSub: {
    fontSize: 10,
    color: '#94a3b8',
    marginTop: 2,
  },
  // Premium Layout Styles (Matching Image 1 & 2)
  premiumOrderCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    borderWidth: 1,
    borderColor: '#f0f2f5',
  },
  orderCardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  premiumCustomerName: {
    fontSize: 16,
    fontWeight: '800',
    color: '#1e293b',
    flex: 1,
    marginRight: 10,
  },
  qtyBadge: {
    backgroundColor: '#fff7ed',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  qtyText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#f97316',
  },
  balQtyBadge: {
    backgroundColor: '#fff1f2',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#fecdd3',
  },
  balQtyText: {
    color: '#e11d48',
    fontSize: 12,
    fontWeight: '900',
  },
  orderCardBottom: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  idContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  premiumOrderId: {
    fontSize: 12,
    color: '#94a3b8',
    fontWeight: '500',
  },
  premiumOrderDate: {
    fontSize: 12,
    color: '#94a3b8',
    fontWeight: '500',
  },
  // Detail View (Image 2)
  detailContainer: {
    flex: 1,
    backgroundColor: '#fff',
  },
  detailHeader: {
    backgroundColor: '#0056b3',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    height: Platform.OS === 'ios' ? 44 : 48,
    elevation: 2,
  },
  detailBackBtn: {
    padding: 4,
  },
  detailHeaderTitle: {
    flex: 1,
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
    textAlign: 'center',
  },
  detailScroll: {
    flex: 1,
  },
  detailScrollContent: {
    padding: 20,
  },
  detailSummaryCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
    elevation: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    marginBottom: 24,
  },
  summaryTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  summaryOrderId: {
    fontSize: 12,
    color: '#94a3b8',
    fontWeight: '600',
    marginBottom: 2,
  },
  summaryCustomer: {
    fontSize: 18,
    fontWeight: '900',
    color: '#0f172a',
    maxWidth: '85%',
  },
  editBtn: {
    padding: 4,
  },
  summaryPriceSection: {
    marginVertical: 12,
  },
  summaryPriceLabel: {
    fontSize: 12,
    color: '#64748b',
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  summaryPriceValue: {
    fontSize: 32,
    fontWeight: '900',
    color: '#1e293b',
    marginTop: 2,
  },
  summaryMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 8,
  },
  detailQtyBadge: {
    backgroundColor: '#fff7ed',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  detailQtyText: {
    color: '#f97316',
    fontWeight: '800',
    fontSize: 13,
  },
  summaryDate: {
    color: '#94a3b8',
    fontSize: 13,
    fontWeight: '600',
  },
  transportSection: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f8fafc',
    padding: 16,
    borderRadius: 14,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: '#f1f5f9',
  },
  detailIconBox: {
    width: 38,
    height: 38,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  transportTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: '#64748b',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  transportText: {
    fontSize: 14,
    color: '#1e293b',
    fontWeight: '600',
    marginTop: 2,
  },
  itemsTableHeader: {
    flexDirection: 'row',
    backgroundColor: '#f1f5f9',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
    marginBottom: 8,
  },
  tableHeadText: {
    fontSize: 10,
    fontWeight: '900',
    color: '#64748b',
    letterSpacing: 0.5,
  },
  itemTableRow: {
    flexDirection: 'row',
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
    alignItems: 'center',
  },
  tableCellText: {
    fontSize: 12,
    color: '#334155',
  },
  detailProductsHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  detailSectionTitle: {
    fontSize: 14,
    fontWeight: '900',
    color: '#1e293b',
    letterSpacing: 0.5,
  },
  itemCountText: {
    fontSize: 12,
    color: '#64748b',
    fontWeight: '600',
  },
  premiumProductCard: {
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
    paddingVertical: 16,
  },
  prodHeader: {
    paddingBottom: 8,
  },
  prodInfoLine: {
    flexDirection: 'row',
    marginBottom: 12,
  },
  prodCode: {
    fontSize: 14,
    fontWeight: '800',
    color: '#64748b',
  },
  prodNameMain: {
    fontSize: 14,
    fontWeight: '800',
    color: '#1e293b',
    flex: 1,
  },
  sizingGrid: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 12,
  },
  sizeBox: {
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 8,
    width: 50,
    height: 50,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sizeLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: '#94a3b8',
    marginBottom: 2,
  },
  sizeVal: {
    fontSize: 14,
    fontWeight: '900',
    color: '#1e293b',
  },
  totalItemQty: {
    fontSize: 13,
    fontWeight: '700',
    color: '#64748b',
  },
  detailFooter: {
    padding: 20,
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
  },
  whatsappBtn: {
    backgroundColor: '#25D366',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    borderRadius: 14,
    elevation: 4,
  },
  whatsappBtnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '800',
    marginLeft: 12,
  },
  waIcon: {
    width: 24,
    height: 24,
    tintColor: '#fff',
  },
});
