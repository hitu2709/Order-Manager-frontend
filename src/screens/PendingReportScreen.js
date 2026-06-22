import React, { useState, useEffect, useCallback } from "react";
import {
  View, Text, TextInput, TouchableOpacity, ScrollView,
  StyleSheet, SafeAreaView, StatusBar, Alert, ActivityIndicator,
  Modal, FlatList, Platform,
} from "react-native";
import DateTimePicker from "@react-native-community/datetimepicker";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import {
  fetchParties, fetchProducts, fetchOrderNumbers, fetchPendingOrderReport
} from "../services/api";
import Icon from "../components/Icon";

// Format Date → YYYY-MM-DD for API, DD/MM/YYYY for display
const toApiDate  = (d) => d.toISOString().split('T')[0];
const toDisplay  = (d) => {
  const dd = String(d.getDate()).padStart(2,'0');
  const mm = String(d.getMonth()+1).padStart(2,'0');
  return `${dd}/${mm}/${d.getFullYear()}`;
};

const FieldLabel = ({ label }) => <Text style={styles.fieldLabel}>{label}</Text>;

const SearchableDropdown = ({ visible, data, onSelect, onClose, title, placeholder, isSimple = false }) => {
  const [search, setSearch] = useState("");
  const filtered = data.filter(item => {
    const val = isSimple ? String(item) : (item.PartyName || item.ProductName || item.ItemCode || "");
    return val.toLowerCase().includes(search.toLowerCase());
  });
  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>{title}</Text>
            <TouchableOpacity onPress={onClose}><Text style={styles.closeText}>Cancel</Text></TouchableOpacity>
          </View>
          <View style={styles.searchBar}>
            <Icon name="search" size={14} color="#90a4ae" />
            <TextInput style={styles.searchInput} placeholder={placeholder} value={search} onChangeText={setSearch} autoFocus />
          </View>
          <FlatList
            data={filtered}
            keyExtractor={(_, i) => i.toString()}
            renderItem={({ item }) => (
              <TouchableOpacity style={styles.listItem} onPress={() => { onSelect(item); setSearch(""); }}>
                <Text style={styles.listItemText}>
                  {isSimple ? item : (item.PartyName || item.ProductName || item.ItemCode)}
                </Text>
              </TouchableOpacity>
            )}
          />
        </View>
      </View>
    </Modal>
  );
};

// Searchable multi-select list for Party modal (rendered inline, no outer Modal)
const PartyMultiList = ({ data, tempParties, onToggle }) => {
  const [search, setSearch] = useState("");
  const filtered = data.filter(item =>
    (item.PartyName || "").toLowerCase().includes(search.toLowerCase())
  );
  return (
    <>
      <View style={styles.searchBar}>
        <Icon name="search" size={14} color="#90a4ae" />
        <TextInput
          style={styles.searchInput}
          placeholder="Search party..."
          value={search}
          onChangeText={setSearch}
          autoFocus
        />
      </View>
      <FlatList
        data={filtered}
        keyExtractor={(_, i) => i.toString()}
        renderItem={({ item }) => {
          const isChecked = tempParties.some(p => p.PartyID === item.PartyID);
          return (
            <TouchableOpacity
              style={[styles.listItem, { flexDirection: 'row', alignItems: 'center' }]}
              onPress={() => onToggle(item)}
            >
              <View style={[styles.cbBox, isChecked && styles.cbBoxChecked]}>
                {isChecked && <Text style={styles.cbTick}>✓</Text>}
              </View>
              <Text style={styles.listItemText}>{item.PartyName}</Text>
            </TouchableOpacity>
          );
        }}
      />
    </>
  );
};


// ── PDF HTML template ──────────────────────────────────────────────────────────
const buildPdfHtml = (data, filters) => {
  const now = new Date().toLocaleString("en-IN");
  const rows = data.map((r, i) => `
    <tr style="background:${i % 2 === 0 ? '#f8faff' : '#fff'}">
      <td>${r.VouchNo || r.OrderNo || '-'}</td>
      <td>${r.OrderDate || r.trans_dt || '-'}</td>
      <td>${r.PartyName || r.CustomerName || '-'}</td>
      <td>${r.ItemCode ? `<b>${r.ItemCode}</b><br/><small>${r.ProductName || ''}</small>` : '-'}</td>
      <td style="text-align:center">${r.OrderQty ?? r.TotalQty ?? '-'}</td>
      <td style="text-align:center">${r.DispatchQty ?? r.DesptchQty ?? 0}</td>
      <td style="text-align:center;color:#d32f2f;font-weight:700">${r.BalQty ?? '-'}</td>
    </tr>`).join("");

  const totalBal = data.reduce((s, r) => s + (parseFloat(r.BalQty) || 0), 0);

  return `<!DOCTYPE html><html><head>
  <meta charset="UTF-8"/>
  <style>
    body{font-family:Arial,sans-serif;margin:0;padding:20px;color:#1a237e;}
    .header{background:linear-gradient(135deg,#0056b3,#1976d2);color:#fff;padding:20px 24px;border-radius:10px;margin-bottom:20px;}
    .header h1{margin:0;font-size:22px;letter-spacing:1px;}
    .header p{margin:4px 0 0;font-size:13px;opacity:.85;}
    .meta{display:flex;gap:16px;margin-bottom:16px;flex-wrap:wrap;}
    .meta-box{background:#e3f2fd;border-radius:8px;padding:10px 16px;font-size:12px;}
    .meta-box b{display:block;color:#0056b3;font-size:14px;margin-top:2px;}
    table{width:100%;border-collapse:collapse;font-size:12px;}
    th{background:#0056b3;color:#fff;padding:8px 6px;text-align:left;font-size:11px;letter-spacing:.5px;}
    td{padding:7px 6px;border-bottom:1px solid #e8eaf6;vertical-align:top;}
    .footer{margin-top:18px;text-align:right;font-size:12px;color:#555;}
    .total-row{background:#e3f2fd!important;font-weight:700;}
    .badge{display:inline-block;background:#0056b3;color:#fff;border-radius:20px;padding:2px 12px;font-size:11px;}
  </style></head><body>
  <div class="header">
    <h1>📋 Pending Order Report</h1>
    <p>Generated on ${now}</p>
  </div>
  <div class="meta">
    <div class="meta-box">Period<b>${filters.fromDate} → ${filters.toDate}</b></div>
    <div class="meta-box">Party<b>${filters.partyName || 'All Parties'}</b></div>
    <div class="meta-box">Order No.<b>${filters.orderLabel || 'All'}</b></div>
    <div class="meta-box">Product<b>${filters.productName || 'All Products'}</b></div>
    <div class="meta-box">Records<b><span class="badge">${data.length}</span></b></div>
  </div>
  <table>
    <thead><tr>
      <th>Order No.</th><th>Date</th><th>Party Name</th><th>Item</th>
      <th style="text-align:center">Ord Qty</th>
      <th style="text-align:center">Disp Qty</th>
      <th style="text-align:center">Bal Qty</th>
    </tr></thead>
    <tbody>${rows}
    <tr class="total-row">
      <td colspan="6" style="text-align:right;padding-right:12px">TOTAL BALANCE</td>
      <td style="text-align:center;color:#d32f2f">${totalBal.toFixed(0)}</td>
    </tr>
    </tbody>
  </table>
  <div class="footer">Pending Order Report • ${now}</div>
</body></html>`;
};

export default function PendingReportScreen({ navigation }) {
  const [loading, setLoading] = useState(false);
  const [dropdownLoading, setDropdownLoading] = useState(false);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [reportData, setReportData] = useState(null);

  const [allParties, setAllParties] = useState([]);
  const [allProducts, setAllProducts] = useState([]);
  const [allOrderNumbers, setAllOrderNumbers] = useState([]);
  const [parties, setParties] = useState([]);
  const [products, setProducts] = useState([]);
  const [orderNumbers, setOrderNumbers] = useState([]);

  // Dates
  const today = new Date();
  const [fromDate, setFromDate] = useState(today);
  const [toDate, setToDate]     = useState(today);
  const [showFromPicker, setShowFromPicker] = useState(false);
  const [showToPicker,   setShowToPicker]   = useState(false);

  // Filters
  const [selectedParties,  setSelectedParties]  = useState([]);   // ← array for multi-select
  const [selectedOrderNos, setSelectedOrderNos] = useState([]);   // ← array for multi-select
  const [selectedProduct,  setSelectedProduct]  = useState(null);
  const [isPendingOnly,    setIsPendingOnly]    = useState(true);

  // Temp selections inside multi-select modals
  const [tempParties,  setTempParties]  = useState([]);
  const [tempOrderNos, setTempOrderNos] = useState([]);

  const [showPartyModal,   setShowPartyModal]   = useState(false);
  const [showOrderModal,   setShowOrderModal]   = useState(false);
  const [showProductModal, setShowProductModal] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const [pD, prD, oD] = await Promise.all([fetchParties(), fetchProducts(), fetchOrderNumbers()]);
        const p = pD.data || [], pr = prD.data || [], o = oD.data || [];
        setAllParties(p); setParties(p);
        setAllProducts(pr); setProducts(pr);
        setAllOrderNumbers(o); setOrderNumbers(o);
      } catch (e) { console.error("Dropdown load error", e); }
    })();
  }, []);

  // Toggle a party in/out of tempParties list
  const toggleParty = useCallback((party) => {
    setTempParties(prev => {
      const exists = prev.some(p => p.PartyID === party.PartyID);
      return exists ? prev.filter(p => p.PartyID !== party.PartyID) : [...prev, party];
    });
  }, []);

  // Confirm multi-select party and cascade order/product lists
  const confirmPartySelection = useCallback(async () => {
    setSelectedParties(tempParties);
    setSelectedOrderNos([]); setSelectedProduct(null);
    setShowPartyModal(false); setReportData(null);
    if (tempParties.length === 0) { setOrderNumbers(allOrderNumbers); setProducts(allProducts); return; }
    setDropdownLoading(true);
    try {
      const partyParam = tempParties.map(p => p.PartyID).join(',');
      const [oD, prD] = await Promise.all([
        fetchOrderNumbers({ partyId: partyParam }),
        fetchProducts({ partyId: tempParties[0].PartyID }),
      ]);
      setOrderNumbers(oD.data || []); setProducts(prD.data || []);
    } catch (e) { console.error(e); } finally { setDropdownLoading(false); }
  }, [tempParties, allOrderNumbers, allProducts]);

  // Toggle a single order in/out of the temp selection list
  const toggleOrderNo = useCallback((order) => {
    setTempOrderNos(prev => {
      const exists = prev.some(o => o.trans_no === order.trans_no);
      return exists ? prev.filter(o => o.trans_no !== order.trans_no) : [...prev, order];
    });
  }, []);

  // Confirm multi-select and cascade product list
  const confirmOrderSelection = useCallback(async () => {
    setSelectedOrderNos(tempOrderNos);
    setShowOrderModal(false); setReportData(null);
    if (tempOrderNos.length === 0) { setProducts(allProducts); return; }
    setDropdownLoading(true);
    try {
      // Use first selected order to narrow products (server supports single orderNo)
      const params = { orderNo: tempOrderNos[0].trans_no };
      if (selectedParty?.PartyID) params.partyId = selectedParty.PartyID;
      const prD = await fetchProducts(params);
      setProducts(prD.data || []);
    } catch (e) { console.error(e); } finally { setDropdownLoading(false); }
  }, [tempOrderNos, selectedParty, allProducts]);


  const handleProductSelect = useCallback(async (product) => {
    const isAll = !product || product.ItemCode === 'All';
    setSelectedProduct(isAll ? null : product);
    setSelectedOrderNos([]);
    setShowProductModal(false); setReportData(null);
    setDropdownLoading(true);
    try {
      const params = {};
      if (!isAll) params.productId = product.ItemCode;
      if (selectedParties.length > 0) params.partyId = selectedParties.map(p => p.PartyID).join(',');
      const oD = await fetchOrderNumbers(Object.keys(params).length ? params : {});
      setOrderNumbers(oD.data || []);
    } catch (e) { console.error(e); } finally { setDropdownLoading(false); }
  }, [selectedParties]);

  const handleReset = () => {
    setSelectedParties([]); setSelectedOrderNos([]); setSelectedProduct(null);
    setTempParties([]); setTempOrderNos([]);
    setParties(allParties); setOrderNumbers(allOrderNumbers); setProducts(allProducts);
    setFromDate(new Date()); setToDate(new Date());
    setIsPendingOnly(true); setReportData(null);
  };

  const handleGenerateReport = async () => {
    setLoading(true); setReportData(null);
    try {
      // Pass comma-separated trans_nos for multi-select
      const orderNoParam = selectedOrderNos.length > 0
        ? selectedOrderNos.map(o => o.trans_no).join(',')
        : 'All';
      const partyParam = selectedParties.length > 0
        ? selectedParties.map(p => p.PartyID).join(',')
        : 'All';
      const res = await fetchPendingOrderReport({
        fromDate: toApiDate(fromDate),
        toDate:   toApiDate(toDate),
        partyId:  partyParam,
        orderNo:  orderNoParam,
        productId: selectedProduct?.ItemCode || 'All',
        pendingOnly: isPendingOnly,
      });
      if (res.success && res.data.length > 0) {
        setReportData(res.data);
      } else {
        Alert.alert("No Data", "No records found for the selected filters.");
      }
    } catch (e) { Alert.alert("Error", "Failed to generate report."); }
    finally { setLoading(false); }
  };

  const handleDownloadPdf = async () => {
    if (!reportData) return;
    setPdfLoading(true);
    try {
      const orderLabel = selectedOrderNos.length > 0
        ? selectedOrderNos.map(o => `${o.trans_dt}(${o.VouchNo})`).join(', ')
        : 'All';
      const partyLabel = selectedParties.length > 0
        ? selectedParties.map(p => p.PartyName).join(', ')
        : null;
      const html = buildPdfHtml(reportData, {
        fromDate: toDisplay(fromDate),
        toDate:   toDisplay(toDate),
        partyName: partyLabel,
        orderLabel,
        productName: selectedProduct ? `${selectedProduct.ItemCode} - ${selectedProduct.ProductName}` : null,
      });
      const { uri } = await Print.printToFileAsync({ html, base64: false });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, { mimeType: "application/pdf", dialogTitle: "Pending Order Report" });
      } else {
        Alert.alert("PDF Saved", `Saved to: ${uri}`);
      }
    } catch (e) { Alert.alert("Error", "Failed to generate PDF."); }
    finally { setPdfLoading(false); }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar backgroundColor="#0056b3" barStyle="light-content" />
      <View style={styles.header}>
        <TouchableOpacity style={styles.headerBack} onPress={() => navigation.goBack()}>
          <Icon name="back" size={22} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Pending Order Report</Text>
        <TouchableOpacity onPress={handleReset} style={{ padding: 4 }}>
          <Text style={{ color: '#fff', fontSize: 13, fontWeight: '700' }}>RESET</Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        {/* Filters Card */}
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Filters</Text>
          {dropdownLoading && (
            <View style={styles.cascadeBar}>
              <ActivityIndicator size="small" color="#0056b3" />
              <Text style={styles.cascadeText}>Updating filters…</Text>
            </View>
          )}
          <View style={styles.row}>
            <View style={styles.halfCol}>
              <FieldLabel label="FROM DATE" />
              <TouchableOpacity style={styles.dateBtn} onPress={() => { setShowFromPicker(true); setReportData(null); }}>
                <Icon name="calendar" size={15} color="#0056b3" />
                <Text style={styles.dateBtnText}>{toDisplay(fromDate)}</Text>
              </TouchableOpacity>
              {showFromPicker && (
                <DateTimePicker
                  value={fromDate}
                  mode="date"
                  display={Platform.OS === 'ios' ? 'inline' : 'calendar'}
                  onChange={(_, d) => { setShowFromPicker(Platform.OS === 'ios'); if (d) setFromDate(d); }}
                  maximumDate={toDate}
                />
              )}
            </View>
            <View style={styles.halfCol}>
              <FieldLabel label="TILL DATE" />
              <TouchableOpacity style={styles.dateBtn} onPress={() => { setShowToPicker(true); setReportData(null); }}>
                <Icon name="calendar" size={15} color="#0056b3" />
                <Text style={styles.dateBtnText}>{toDisplay(toDate)}</Text>
              </TouchableOpacity>
              {showToPicker && (
                <DateTimePicker
                  value={toDate}
                  mode="date"
                  display={Platform.OS === 'ios' ? 'inline' : 'calendar'}
                  onChange={(_, d) => { setShowToPicker(Platform.OS === 'ios'); if (d) setToDate(d); }}
                  minimumDate={fromDate}
                />
              )}
            </View>
          </View>

          <FieldLabel label="PARTY NAME" />
          <TouchableOpacity style={styles.dropdown} onPress={() => { setTempParties(selectedParties); setShowPartyModal(true); }}>
            <Text style={selectedParties.length > 0 ? styles.dropdownValue : styles.dropdownPlaceholder}>
              {selectedParties.length > 0 ? `${selectedParties.length} party(s) selected` : 'All Parties'}
            </Text>
            <Icon name="chevron" size={16} color="#90a4ae" />
          </TouchableOpacity>

          <View style={styles.row}>
            <View style={styles.halfCol}>
              <FieldLabel label="ORDER NO." />
              <TouchableOpacity style={styles.dropdown} onPress={() => { setTempOrderNos(selectedOrderNos); setShowOrderModal(true); }}>
                <Text style={selectedOrderNos.length > 0 ? styles.dropdownValue : styles.dropdownPlaceholder}>
                  {selectedOrderNos.length > 0 ? `${selectedOrderNos.length} order(s) selected` : 'All Orders'}
                </Text>
                <Icon name="chevron" size={16} color="#90a4ae" />
              </TouchableOpacity>
            </View>
            <View style={styles.halfCol}>
              <FieldLabel label="PENDING ONLY" />
              <TouchableOpacity style={[styles.checkboxContainer, isPendingOnly && styles.checkboxActive]} onPress={() => { setIsPendingOnly(!isPendingOnly); setReportData(null); }}>
                <View style={[styles.checkbox, isPendingOnly && styles.checkboxFilled]} />
                <Text style={[styles.checkboxLabel, isPendingOnly && { color: '#0056b3' }]}>Pending Only</Text>
              </TouchableOpacity>
            </View>
          </View>

          <FieldLabel label="PRODUCT" />
          <TouchableOpacity style={styles.dropdown} onPress={() => setShowProductModal(true)}>
            <Text style={selectedProduct ? styles.dropdownValue : styles.dropdownPlaceholder}>{selectedProduct ? `${selectedProduct.ItemCode} - ${selectedProduct.ProductName}` : "All Products"}</Text>
            <Icon name="chevron" size={16} color="#90a4ae" />
          </TouchableOpacity>

          {(selectedParties.length > 0 || selectedOrderNos.length > 0 || selectedProduct) && (
            <View style={styles.chipRow}>
              {selectedParties.map(p => (
                <View key={p.PartyID} style={styles.chip}>
                  <Text style={styles.chipText}>{p.PartyName}</Text>
                </View>
              ))}
              {selectedOrderNos.map(o => (
                <View key={o.trans_no} style={styles.chip}>
                  <Text style={styles.chipText}>{o.trans_dt}({o.VouchNo})</Text>
                </View>
              ))}
              {selectedProduct && <View style={styles.chip}><Text style={styles.chipText}>{selectedProduct.ItemCode}</Text></View>}
            </View>
          )}

          <TouchableOpacity style={styles.generateBtn} onPress={handleGenerateReport} disabled={loading}>
            {loading ? <ActivityIndicator color="#fff" /> : <>
              <Icon name="reports" size={18} color="#fff" />
              <Text style={styles.generateBtnText}>GENERATE REPORT</Text>
            </>}
          </TouchableOpacity>
        </View>

        {/* Results */}
        {reportData && (
          <View style={styles.resultsCard}>
            <View style={styles.resultsHeader}>
              <View>
                <Text style={styles.resultsTitle}>Results</Text>
                <Text style={styles.resultsCount}>{reportData.length} record(s) found</Text>
              </View>
              <TouchableOpacity style={styles.pdfBtn} onPress={handleDownloadPdf} disabled={pdfLoading}>
                {pdfLoading
                  ? <ActivityIndicator size="small" color="#fff" />
                  : <><Text style={styles.pdfBtnText}>📄 PDF</Text></>}
              </TouchableOpacity>
            </View>

            {/* Table header */}
            <View style={styles.tableHeader}>
              <Text style={[styles.th, { flex: 1 }]}>Order</Text>
              <Text style={[styles.th, { flex: 1.2 }]}>Party</Text>
              <Text style={[styles.th, { flex: 1.2 }]}>Item</Text>
              <Text style={[styles.th, { flex: 0.7, textAlign: 'center' }]}>Ord</Text>
              <Text style={[styles.th, { flex: 0.7, textAlign: 'center' }]}>Disp</Text>
              <Text style={[styles.th, { flex: 0.7, textAlign: 'center' }]}>Bal</Text>
            </View>

            {reportData.map((r, i) => (
              <View key={i} style={[styles.tableRow, i % 2 === 0 && { backgroundColor: '#f8faff' }]}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.tdBold}>{r.VouchNo || r.OrderNo}</Text>
                  <Text style={styles.tdSub}>{r.OrderDate || r.trans_dt}</Text>
                </View>
                <Text style={[styles.td, { flex: 1.2 }]} numberOfLines={2}>{r.PartyName || r.CustomerName}</Text>
                <View style={{ flex: 1.2 }}>
                  <Text style={styles.tdBold} numberOfLines={1}>{r.ItemCode || '-'}</Text>
                  <Text style={styles.tdSub} numberOfLines={2}>{r.ProductName}</Text>
                </View>
                <Text style={[styles.td, { flex: 0.7, textAlign: 'center' }]}>{r.OrderQty ?? '-'}</Text>
                <Text style={[styles.td, { flex: 0.7, textAlign: 'center' }]}>{r.DispatchQty ?? 0}</Text>
                <Text style={[styles.tdBal, { flex: 0.7 }]}>{r.BalQty ?? '-'}</Text>
              </View>
            ))}

            {/* Totals row */}
            <View style={[styles.tableRow, { backgroundColor: '#e3f2fd' }]}>
              <Text style={[styles.tdBold, { flex: 3.4 }]}>TOTAL</Text>
              <Text style={[styles.td, { flex: 0.7, textAlign: 'center', fontWeight: '700' }]}>{reportData.reduce((s, r) => s + (parseFloat(r.OrderQty) || 0), 0).toFixed(0)}</Text>
              <Text style={[styles.td, { flex: 0.7, textAlign: 'center', fontWeight: '700' }]}>{reportData.reduce((s, r) => s + (parseFloat(r.DispatchQty) || 0), 0).toFixed(0)}</Text>
              <Text style={[styles.tdBal, { flex: 0.7, fontSize: 14 }]}>{reportData.reduce((s, r) => s + (parseFloat(r.BalQty) || 0), 0).toFixed(0)}</Text>
            </View>
          </View>
        )}
      </ScrollView>

      {/* Party multi-select modal */}
      <Modal visible={showPartyModal} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Select Parties</Text>
              <TouchableOpacity onPress={() => setShowPartyModal(false)}>
                <Text style={styles.closeText}>Cancel</Text>
              </TouchableOpacity>
            </View>

            {tempParties.length > 0 && (
              <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#e3f2fd', borderRadius: 10, padding: 10, marginBottom: 12 }}>
                <Text style={{ color: '#0056b3', fontWeight: '700', flex: 1 }}>{tempParties.length} party(s) selected</Text>
                <TouchableOpacity onPress={() => setTempParties([])}>
                  <Text style={{ color: '#e91e63', fontWeight: '600', fontSize: 12 }}>Clear all</Text>
                </TouchableOpacity>
              </View>
            )}

            <PartyMultiList
              data={parties}
              tempParties={tempParties}
              onToggle={toggleParty}
            />

            <TouchableOpacity style={styles.doneBtn} onPress={confirmPartySelection}>
              <Text style={styles.doneBtnText}>DONE  ({tempParties.length} selected)</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Order No. multi-select modal */}
      <Modal visible={showOrderModal} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{`Orders${selectedParty ? ` — ${selectedParty.PartyName}` : ''}`}</Text>
              <TouchableOpacity onPress={() => setShowOrderModal(false)}>
                <Text style={styles.closeText}>Cancel</Text>
              </TouchableOpacity>
            </View>

            {/* Selection counter */}
            {tempOrderNos.length > 0 && (
              <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#e3f2fd', borderRadius: 10, padding: 10, marginBottom: 12 }}>
                <Text style={{ color: '#0056b3', fontWeight: '700', flex: 1 }}>{tempOrderNos.length} order(s) selected</Text>
                <TouchableOpacity onPress={() => setTempOrderNos([])}>
                  <Text style={{ color: '#e91e63', fontWeight: '600', fontSize: 12 }}>Clear all</Text>
                </TouchableOpacity>
              </View>
            )}

            <FlatList
              data={orderNumbers}
              keyExtractor={(_, i) => i.toString()}
              renderItem={({ item }) => {
                const isChecked = tempOrderNos.some(o => o.trans_no === item.trans_no);
                return (
                  <TouchableOpacity style={[styles.listItem, { flexDirection: 'row', alignItems: 'center' }]} onPress={() => toggleOrderNo(item)}>
                    {/* Checkbox */}
                    <View style={[styles.cbBox, isChecked && styles.cbBoxChecked]}>
                      {isChecked && <Text style={styles.cbTick}>✓</Text>}
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.listItemText}>{item.trans_dt}({item.VouchNo})</Text>
                      <Text style={{ fontSize: 11, color: '#90a4ae', marginTop: 2 }}>Order No: {item.trans_no}</Text>
                    </View>
                  </TouchableOpacity>
                );
              }}
            />

            {/* Done button */}
            <TouchableOpacity style={styles.doneBtn} onPress={confirmOrderSelection}>
              <Text style={styles.doneBtnText}>DONE  ({tempOrderNos.length} selected)</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <SearchableDropdown visible={showProductModal} data={[{ ItemCode: 'All', ProductName: 'All Products' }, ...products]} title={`Product${selectedParty ? ` — ${selectedParty.PartyName}` : ''}`} placeholder="Search product..." onSelect={p => handleProductSelect(p.ItemCode === 'All' ? null : p)} onClose={() => setShowProductModal(false)} />

    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#f0f4ff" },
  header: { backgroundColor: "#0056b3", flexDirection: "row", alignItems: "center", paddingHorizontal: 14, height: 80, paddingTop: 20, elevation: 4 },
  headerBack: { marginRight: 8, padding: 4 },
  headerTitle: { flex: 1, color: "#fff", fontSize: 18, fontWeight: "700" },
  scroll: { flex: 1 }, scrollContent: { padding: 16, gap: 16 },
  card: { backgroundColor: "#fff", borderRadius: 16, padding: 18, elevation: 3, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 8 },
  sectionTitle: { fontSize: 16, fontWeight: '800', color: '#0056b3', marginBottom: 4 },
  cascadeBar: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#e3f2fd', borderRadius: 10, padding: 10, marginVertical: 8, gap: 10 },
  cascadeText: { color: '#0056b3', fontSize: 13, fontWeight: '600' },
  row: { flexDirection: "row", gap: 12 }, halfCol: { flex: 1 },
  fieldLabel: { fontSize: 10, fontWeight: "700", color: "#78909c", letterSpacing: 0.8, marginBottom: 6, marginTop: 12, textTransform: "uppercase" },
  input: { borderWidth: 1.5, borderColor: "#e0e7ef", borderRadius: 10, paddingHorizontal: 12, fontSize: 14, color: "#263238", backgroundColor: "#fafcff", height: 46 },
  dropdown: { borderWidth: 1.5, borderColor: "#e0e7ef", borderRadius: 10, paddingHorizontal: 12, flexDirection: "row", alignItems: "center", backgroundColor: "#fafcff", height: 46 },
  dropdownPlaceholder: { flex: 1, fontSize: 14, color: "#b0bec5" },
  dropdownValue: { flex: 1, fontSize: 14, color: "#263238", fontWeight: "500" },
  checkboxContainer: { flexDirection: "row", alignItems: "center", borderWidth: 1.5, borderColor: "#e0e7ef", borderRadius: 10, paddingHorizontal: 12, height: 46, backgroundColor: "#fafcff" },
  checkboxActive: { borderColor: "#0056b3", backgroundColor: "#e3f2fd" },
  checkbox: { width: 16, height: 16, borderRadius: 3, borderWidth: 2, borderColor: "#90a4ae", marginRight: 8 },
  checkboxFilled: { backgroundColor: "#0056b3", borderColor: "#0056b3" },
  checkboxLabel: { fontSize: 12, color: "#78909c", fontWeight: "600" },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 14 },
  chip: { backgroundColor: '#e3f2fd', borderRadius: 20, paddingHorizontal: 12, paddingVertical: 4 },
  chipText: { color: '#0056b3', fontSize: 12, fontWeight: '600' },
  generateBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", backgroundColor: "#0056b3", borderRadius: 12, paddingVertical: 15, marginTop: 20, elevation: 4, gap: 10 },
  generateBtnText: { color: "#fff", fontWeight: "800", fontSize: 15 },
  resultsCard: { backgroundColor: "#fff", borderRadius: 16, elevation: 3, overflow: 'hidden', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 8 },
  resultsHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderBottomColor: '#e8eaf6' },
  resultsTitle: { fontSize: 16, fontWeight: '800', color: '#0056b3' },
  resultsCount: { fontSize: 12, color: '#78909c', marginTop: 2 },
  pdfBtn: { backgroundColor: '#0056b3', borderRadius: 10, paddingHorizontal: 16, paddingVertical: 8, flexDirection: 'row', alignItems: 'center', gap: 6 },
  pdfBtnText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  tableHeader: { flexDirection: 'row', backgroundColor: '#0056b3', paddingVertical: 10, paddingHorizontal: 12 },
  th: { color: '#fff', fontSize: 11, fontWeight: '700', letterSpacing: 0.5 },
  tableRow: { flexDirection: 'row', paddingVertical: 10, paddingHorizontal: 12, borderBottomWidth: 1, borderBottomColor: '#f0f2f5', alignItems: 'center' },
  td: { fontSize: 12, color: '#37474f' },
  tdBold: { fontSize: 12, color: '#1a237e', fontWeight: '700' },
  tdSub: { fontSize: 10, color: '#90a4ae', marginTop: 1 },
  tdBal: { fontSize: 12, color: '#c62828', fontWeight: '800', textAlign: 'center' },
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" },
  modalContent: { backgroundColor: "#fff", borderTopLeftRadius: 24, borderTopRightRadius: 24, height: "70%", padding: 24 },
  modalHeader: { flexDirection: "row", justifyContent: "space-between", marginBottom: 20 },
  modalTitle: { fontSize: 18, fontWeight: "bold", color: "#0056b3" },
  closeText: { color: "#e91e63", fontWeight: "bold" },
  searchBar: { flexDirection: "row", alignItems: "center", backgroundColor: "#f5f7fa", borderRadius: 12, paddingHorizontal: 12, height: 48, marginBottom: 16 },
  searchInput: { flex: 1, marginLeft: 10, fontSize: 15 },
  listItem: { paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: "#f0f2f5" },
  listItemText: { fontSize: 15, color: "#333", fontWeight: "500" },
  // Date picker button
  dateBtn: { borderWidth: 1.5, borderColor: '#e0e7ef', borderRadius: 10, paddingHorizontal: 12, height: 46, flexDirection: 'row', alignItems: 'center', backgroundColor: '#fafcff', gap: 8 },
  dateBtnText: { fontSize: 14, color: '#263238', fontWeight: '500', flex: 1 },
  // Multi-select checkboxes
  cbBox: { width: 22, height: 22, borderRadius: 5, borderWidth: 2, borderColor: '#b0bec5', marginRight: 12, alignItems: 'center', justifyContent: 'center' },
  cbBoxChecked: { backgroundColor: '#0056b3', borderColor: '#0056b3' },
  cbTick: { color: '#fff', fontSize: 13, fontWeight: '800', lineHeight: 16 },
  // Done button in order modal
  doneBtn: { backgroundColor: '#0056b3', borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginTop: 14 },
  doneBtnText: { color: '#fff', fontWeight: '800', fontSize: 15, letterSpacing: 0.5 },
});
