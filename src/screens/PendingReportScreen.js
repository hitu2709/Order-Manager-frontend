import React, { useState, useEffect, useCallback } from "react";
import {
  View, Text, TextInput, TouchableOpacity, ScrollView,
  StyleSheet, SafeAreaView, StatusBar, Alert, ActivityIndicator,
  Modal, FlatList, Platform,
} from "react-native";
import DateTimePicker from "@react-native-community/datetimepicker";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import * as FileSystem from "expo-file-system";
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

// Searchable multi-select list for Party modal (inline, no outer Modal wrapper)
const PartySearchList = ({ data, tempParties, onToggle }) => {
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
        />
      </View>
      <FlatList
        data={filtered}
        keyExtractor={(item) => item.PartyID}
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


// ── PDF HTML template — Crystal Report format ──────────────────────────────────
const buildPdfHtml = (data, filters) => {
  const now = new Date().toLocaleString("en-IN");
  const fN = (v) => parseFloat(v || 0).toFixed(2);

  // Build party → order → rows structure
  const partyMap = new Map();
  data.forEach(r => {
    const pKey = (r.PartyCode || '') + '|' + (r.PartyName || '');
    if (!partyMap.has(pKey)) partyMap.set(pKey, { partyName: r.PartyName || '', orders: new Map() });
    const party = partyMap.get(pKey);
    const oKey = String(r.OrderNo || r.VouchNo || '');
    if (!party.orders.has(oKey)) {
      party.orders.set(oKey, { vouchNo: r.VouchNo, orderDate: r.OrderDate || '', transport: r.Transport || '', rows: [] });
    }
    party.orders.get(oKey).rows.push(r);
  });

  let partyHtml = '';
  partyMap.forEach(party => {
    let partyOrd = 0, partyDisp = 0, partySetoff = 0, partyBal = 0, partyAmt = 0;
    let ordersHtml = '';
    party.orders.forEach(order => {
      const subOrd     = order.rows.reduce((s, r) => s + (parseFloat(r.OrderQty)    || 0), 0);
      const subDisp    = order.rows.reduce((s, r) => s + (parseFloat(r.DispatchQty) || 0), 0);
      const subSetoff  = order.rows.reduce((s, r) => s + (parseFloat(r.SetoffQty)   || 0), 0);
      const subBal     = order.rows.reduce((s, r) => s + (parseFloat(r.BalQty)      || 0), 0);
      const subAmt     = order.rows.reduce((s, r) => s + (parseFloat(r.Amount)      || 0), 0);
      partyOrd += subOrd; partyDisp += subDisp; partySetoff += subSetoff; partyBal += subBal; partyAmt += subAmt;

      const itemRows = order.rows.map((r, ii) => `
        <tr style="background:${ii%2===0?'#f8faff':'#fff'}">
          <td style="text-align:center;font-weight:700">${r.SrNo || (ii+1)}</td>
          <td><b>${r.ItemCode||''}</b></td>
          <td>${r.ProductName||''}</td>
          <td style="text-align:center">${r.Unit||'PC'}</td>
          <td style="text-align:right">${parseFloat(r.OrderQty||0).toFixed(0)}</td>
          <td style="text-align:right">${parseFloat(r.DispatchQty||0).toFixed(0)}</td>
          <td style="text-align:right">${parseFloat(r.SetoffQty||0).toFixed(0)}</td>
          <td style="text-align:right;font-weight:700;color:#cc0000">${parseFloat(r.BalQty||0).toFixed(0)}</td>
          <td style="text-align:right">${fN(r.Disc)}</td>
          <td style="text-align:right">${fN(r.Rate)}</td>
          <td style="text-align:right;font-weight:700">${fN(r.Amount)}</td>
        </tr>`).join('');

      ordersHtml += `
        <tr class="order-header">
          <td colspan="11">
            <b>Order No:- ${order.vouchNo}</b> &nbsp;&nbsp; Date:- ${order.orderDate}
            ${order.transport ? `&nbsp;&nbsp; Transport:- ${order.transport}` : ''}
          </td>
        </tr>
        <tr class="col-header">
          <th>Sr</th><th>Item Code</th><th>Item Name</th><th style="text-align:center">Unit</th>
          <th style="text-align:right">O. Qty</th><th style="text-align:right">D.Qty</th>
          <th style="text-align:right">Setoff</th><th style="text-align:right">Bal Qty</th>
          <th style="text-align:right">Disc.</th><th style="text-align:right">Rate</th>
          <th style="text-align:right">Amount</th>
        </tr>
        ${itemRows}
        <tr class="order-total">
          <td colspan="4" style="text-align:right;font-weight:700;color:#cc0000;padding-right:8px">Order Wise Total</td>
          <td style="text-align:right;font-weight:700;color:#cc0000">${subOrd.toFixed(0)}</td>
          <td style="text-align:right;font-weight:700;color:#cc0000">${subDisp.toFixed(0)}</td>
          <td style="text-align:right;font-weight:700;color:#cc0000">${subSetoff.toFixed(0)}</td>
          <td style="text-align:right;font-weight:700;color:#cc0000">${subBal.toFixed(0)}</td>
          <td></td><td></td>
          <td style="text-align:right;font-weight:700;color:#cc0000">${fN(subAmt)}</td>
        </tr>`;
    });

    partyHtml += `
      <tr class="party-header"><td colspan="11">Party Name:&nbsp;&nbsp;&nbsp;${party.partyName}</td></tr>
      ${ordersHtml}
      <tr class="party-total">
        <td colspan="4" style="font-weight:700">Party Wise Total</td>
        <td style="text-align:right;font-weight:800">${partyOrd.toFixed(0)}</td>
        <td style="text-align:right;font-weight:800">${partyDisp.toFixed(0)}</td>
        <td style="text-align:right;font-weight:800">${partySetoff.toFixed(0)}</td>
        <td style="text-align:right;font-weight:800">${partyBal.toFixed(0)}</td>
        <td></td><td></td>
        <td style="text-align:right;font-weight:800">${fN(partyAmt)}</td>
      </tr>`;
  });

  return `<!DOCTYPE html><html><head><meta charset="UTF-8"/>
  <style>
    body{font-family:Arial,sans-serif;margin:0;padding:20px;color:#1a237e;font-size:11px;}
    .hdr{background:linear-gradient(135deg,#0056b3,#1976d2);color:#fff;padding:14px 20px;border-radius:8px;margin-bottom:16px;}
    .hdr h1{margin:0;font-size:18px;} .hdr p{margin:3px 0 0;font-size:11px;opacity:.85;}
    table{width:100%;border-collapse:collapse;margin-bottom:0;}
    td,th{padding:4px 6px;border-bottom:1px solid #e8eaf6;vertical-align:top;}
    .party-header td{background:#1565C0;color:#fff;font-weight:700;font-size:12px;padding:6px 10px;}
    .order-header td{background:#FFF9C4;color:#1a1a00;font-weight:700;font-size:11px;padding:4px 10px;border-bottom:1px solid #f0e000;}
    .col-header th{background:#e8f0fe;color:#0056b3;font-weight:700;font-size:10px;padding:4px 6px;}
    .order-total td{background:#FFF9C4;border-top:1.5px solid #e0cc00;}
    .party-total td{background:#e8f0fe;border-top:2px solid #0056b3;color:#0056b3;font-size:11px;}
  </style></head><body>
  <div class="hdr"><h1>📋 Pending Order Report</h1>
    <p>Period: ${filters.fromDate} → ${filters.toDate} &nbsp;|&nbsp; Generated: ${now}</p>
  </div>
  <table><tbody>${partyHtml}</tbody></table>
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
  const [selectedParties,  setSelectedParties]  = useState([]);   // multi-select array
  const [selectedOrderNos, setSelectedOrderNos] = useState([]);   // multi-select array
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

  // Toggle a party in/out of temp selection
  const toggleParty = useCallback((party) => {
    setTempParties(prev => {
      const exists = prev.some(p => p.PartyID === party.PartyID);
      return exists ? prev.filter(p => p.PartyID !== party.PartyID) : [...prev, party];
    });
  }, []);

  // Confirm party selection and cascade order/product dropdowns
  const confirmPartySelection = useCallback(async () => {
    setSelectedParties(tempParties);
    setSelectedOrderNos([]); setSelectedProduct(null);
    setShowPartyModal(false); setReportData(null);
    if (tempParties.length === 0) {
      setOrderNumbers(allOrderNumbers); setProducts(allProducts); return;
    }
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
      const params = { orderNo: tempOrderNos[0].trans_no };
      if (selectedParties.length > 0) params.partyId = selectedParties.map(p => p.PartyID).join(',');
      const prD = await fetchProducts(params);
      setProducts(prD.data || []);
    } catch (e) { console.error(e); } finally { setDropdownLoading(false); }
  }, [tempOrderNos, selectedParties, allProducts]);


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

      // Build custom filename: PartyName_OrderNo_DD-MM-YYYY.pdf
      const safeParty = (partyLabel || 'AllParties').replace(/[^a-zA-Z0-9]/g, '_');
      const safeOrder = selectedOrderNos.length > 0
        ? selectedOrderNos.map(o => o.VouchNo).join('-')
        : 'AllOrders';
      const today = toDisplay(new Date()).replace(/\//g, '-');
      const fileName = `${safeParty}_${safeOrder}_${today}.pdf`;
      const destUri = `${FileSystem.cacheDirectory}${fileName}`;
      await FileSystem.copyAsync({ from: uri, to: destUri });

      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(destUri, { mimeType: "application/pdf", dialogTitle: "Pending Order Report", UTI: "com.adobe.pdf" });
      } else {
        Alert.alert("PDF Saved", `Saved as: ${fileName}`);
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

        {/* Results — Crystal Report format */}
        {reportData && (() => {
          // Group: party → order → rows
          const partyMap = new Map();
          reportData.forEach(r => {
            const pKey = (r.PartyCode || '') + '|' + (r.PartyName || '');
            if (!partyMap.has(pKey)) partyMap.set(pKey, { partyName: r.PartyName || '', orders: new Map() });
            const party = partyMap.get(pKey);
            const oKey = String(r.OrderNo || r.VouchNo || '');
            if (!party.orders.has(oKey)) {
              party.orders.set(oKey, { vouchNo: r.VouchNo, orderDate: r.OrderDate || '', transport: r.Transport || '', rows: [] });
            }
            party.orders.get(oKey).rows.push(r);
          });

          const ColHeader = () => (
            <View style={styles.prColHeader}>
              <Text style={[styles.prTh, { width: 28 }]}>Sr</Text>
              <Text style={[styles.prTh, { width: 82 }]}>Item Code</Text>
              <Text style={[styles.prTh, { flex: 1 }]}>Item Name</Text>
              <Text style={[styles.prTh, { width: 30, textAlign: 'center' }]}>Unit</Text>
              <Text style={[styles.prTh, { width: 40, textAlign: 'right' }]}>O.Qty</Text>
              <Text style={[styles.prTh, { width: 40, textAlign: 'right' }]}>D.Qty</Text>
              <Text style={[styles.prTh, { width: 40, textAlign: 'right' }]}>Setoff</Text>
              <Text style={[styles.prTh, { width: 44, textAlign: 'right' }]}>Bal Qty</Text>
              <Text style={[styles.prTh, { width: 48, textAlign: 'right' }]}>Disc.</Text>
              <Text style={[styles.prTh, { width: 56, textAlign: 'right' }]}>Rate</Text>
              <Text style={[styles.prTh, { width: 66, textAlign: 'right' }]}>Amount</Text>
            </View>
          );

          const parties = [];
          partyMap.forEach((p, k) => parties.push({ key: k, ...p }));

          return (
            <View style={styles.resultsCard}>
              {/* Results header bar */}
              <View style={styles.resultsHeader}>
                <View>
                  <Text style={styles.resultsTitle}>Results</Text>
                  <Text style={styles.resultsCount}>{reportData.length} record(s) found</Text>
                </View>
                <TouchableOpacity style={styles.pdfBtn} onPress={handleDownloadPdf} disabled={pdfLoading}>
                  {pdfLoading ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.pdfBtnText}>📄 PDF</Text>}
                </TouchableOpacity>
              </View>

              <ScrollView horizontal>
                <View style={{ minWidth: 750 }}>
                  {parties.map((party, pi) => {
                    const orders = [];
                    party.orders.forEach((o, k) => orders.push({ key: k, ...o }));

                    const partyOrd    = orders.reduce((s, o) => s + o.rows.reduce((ss, r) => ss + (parseFloat(r.OrderQty)    || 0), 0), 0);
                    const partyDisp   = orders.reduce((s, o) => s + o.rows.reduce((ss, r) => ss + (parseFloat(r.DispatchQty) || 0), 0), 0);
                    const partySetoff = orders.reduce((s, o) => s + o.rows.reduce((ss, r) => ss + (parseFloat(r.SetoffQty)   || 0), 0), 0);
                    const partyBal    = orders.reduce((s, o) => s + o.rows.reduce((ss, r) => ss + (parseFloat(r.BalQty)      || 0), 0), 0);
                    const partyAmt    = orders.reduce((s, o) => s + o.rows.reduce((ss, r) => ss + (parseFloat(r.Amount)      || 0), 0), 0);

                    return (
                      <View key={pi} style={styles.prPartyBlock}>
                        {/* Party header */}
                        <View style={styles.prPartyHeader}>
                          <Text style={styles.prPartyHeaderText}>Party Name:   {party.partyName}</Text>
                        </View>

                        {orders.map((order, oi) => {
                          const subOrd    = order.rows.reduce((s, r) => s + (parseFloat(r.OrderQty)    || 0), 0);
                          const subDisp   = order.rows.reduce((s, r) => s + (parseFloat(r.DispatchQty) || 0), 0);
                          const subSetoff = order.rows.reduce((s, r) => s + (parseFloat(r.SetoffQty)   || 0), 0);
                          const subBal    = order.rows.reduce((s, r) => s + (parseFloat(r.BalQty)      || 0), 0);
                          const subAmt    = order.rows.reduce((s, r) => s + (parseFloat(r.Amount)      || 0), 0);

                          return (
                            <View key={oi}>
                              {/* Order header (yellow) */}
                              <View style={styles.prOrderHeader}>
                                <Text style={styles.prOrderHeaderText}>
                                  {'Order No. ' + order.vouchNo + '     Date :- ' + order.orderDate +
                                    (order.transport ? '     Transport :- ' + order.transport : '')}
                                </Text>
                              </View>
                              <ColHeader />
                              {order.rows.map((r, ii) => (
                                <View key={ii} style={[styles.prItemRow, ii % 2 === 1 && styles.prItemRowAlt]}>
                                  <Text style={[styles.prTd, { width: 28, textAlign: 'center', fontWeight: '700' }]}>{r.SrNo || (ii + 1)}</Text>
                                  <Text style={[styles.prTd, { width: 82 }]} numberOfLines={1}>{r.ItemCode}</Text>
                                  <Text style={[styles.prTd, { flex: 1 }]} numberOfLines={2}>{r.ProductName}</Text>
                                  <Text style={[styles.prTd, { width: 30, textAlign: 'center' }]}>{r.Unit || 'PC'}</Text>
                                  <Text style={[styles.prTd, { width: 40, textAlign: 'right' }]}>{parseFloat(r.OrderQty    || 0).toFixed(0)}</Text>
                                  <Text style={[styles.prTd, { width: 40, textAlign: 'right' }]}>{parseFloat(r.DispatchQty || 0).toFixed(0)}</Text>
                                  <Text style={[styles.prTd, { width: 40, textAlign: 'right' }]}>{parseFloat(r.SetoffQty   || 0).toFixed(0)}</Text>
                                  <Text style={[styles.prTd, { width: 44, textAlign: 'right', color: '#cc0000', fontWeight: '700' }]}>{parseFloat(r.BalQty || 0).toFixed(0)}</Text>
                                  <Text style={[styles.prTd, { width: 48, textAlign: 'right' }]}>{parseFloat(r.Disc   || 0).toFixed(2)}</Text>
                                  <Text style={[styles.prTd, { width: 56, textAlign: 'right' }]}>{parseFloat(r.Rate   || 0).toFixed(2)}</Text>
                                  <Text style={[styles.prTd, { width: 66, textAlign: 'right', fontWeight: '600' }]}>{parseFloat(r.Amount || 0).toFixed(2)}</Text>
                                </View>
                              ))}
                              {/* Order Wise Total */}
                              <View style={styles.prOrderTotal}>
                                <Text style={[styles.prTotalLabel, { flex: 1 }]}>Order Wise Total</Text>
                                <Text style={[styles.prTotalNum, { width: 30 }]}></Text>
                                <Text style={[styles.prTotalNum, { width: 40 }]}>{subOrd.toFixed(0)}</Text>
                                <Text style={[styles.prTotalNum, { width: 40 }]}>{subDisp.toFixed(0)}</Text>
                                <Text style={[styles.prTotalNum, { width: 40 }]}>{subSetoff.toFixed(0)}</Text>
                                <Text style={[styles.prTotalNum, { width: 44 }]}>{subBal.toFixed(0)}</Text>
                                <Text style={[styles.prTotalNum, { width: 48 }]}></Text>
                                <Text style={[styles.prTotalNum, { width: 56 }]}></Text>
                                <Text style={[styles.prTotalNum, { width: 66 }]}>{subAmt.toFixed(2)}</Text>
                              </View>
                            </View>
                          );
                        })}

                        {/* Party Wise Total */}
                        <View style={styles.prPartyTotal}>
                          <Text style={[styles.prPartyTotalLabel, { flex: 1 }]}>Party Wise Total</Text>
                          <Text style={[styles.prPartyTotalNum, { width: 30 }]}></Text>
                          <Text style={[styles.prPartyTotalNum, { width: 40 }]}>{partyOrd.toFixed(0)}</Text>
                          <Text style={[styles.prPartyTotalNum, { width: 40 }]}>{partyDisp.toFixed(0)}</Text>
                          <Text style={[styles.prPartyTotalNum, { width: 40 }]}>{partySetoff.toFixed(0)}</Text>
                          <Text style={[styles.prPartyTotalNum, { width: 44 }]}>{partyBal.toFixed(0)}</Text>
                          <Text style={[styles.prPartyTotalNum, { width: 48 }]}></Text>
                          <Text style={[styles.prPartyTotalNum, { width: 56 }]}></Text>
                          <Text style={[styles.prPartyTotalNum, { width: 66 }]}>{partyAmt.toFixed(2)}</Text>
                        </View>
                      </View>
                    );
                  })}
                </View>
              </ScrollView>
            </View>
          );
        })()}
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
            <PartySearchList data={parties} tempParties={tempParties} onToggle={toggleParty} />
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
              <Text style={styles.modalTitle}>{`Orders${selectedParties.length > 0 ? ` — ${selectedParties.map(p => p.PartyName).join(', ')}` : ''}`}</Text>
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

      <SearchableDropdown visible={showProductModal} data={[{ ItemCode: 'All', ProductName: 'All Products' }, ...products]} title={`Product${selectedParties.length > 0 ? ` — ${selectedParties.map(p => p.PartyName).join(', ')}` : ''}`} placeholder="Search product..." onSelect={p => handleProductSelect(p.ItemCode === 'All' ? null : p)} onClose={() => setShowProductModal(false)} />

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
  // Order group header (VouchNo banner between groups)
  orderGroupHeader: { backgroundColor: '#0056b3', paddingVertical: 7, paddingHorizontal: 12, marginTop: 4 },
  orderGroupTitle: { color: '#fff', fontSize: 11, fontWeight: '700', letterSpacing: 0.4 },
  // Subtotal row per order
  subtotalRow: { flexDirection: 'row', paddingVertical: 8, paddingHorizontal: 12, backgroundColor: '#e8f4fd', borderTopWidth: 1.5, borderTopColor: '#90caf9', marginBottom: 2 },

  // ── Crystal Report styles ──────────────────────────────────────────────────────
  prPartyBlock: { marginBottom: 6 },
  prPartyHeader: { backgroundColor: '#1565C0', paddingVertical: 7, paddingHorizontal: 10 },
  prPartyHeaderText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  prOrderHeader: { backgroundColor: '#FFF9C4', paddingHorizontal: 10, paddingVertical: 5, borderBottomWidth: 1, borderBottomColor: '#f0e000' },
  prOrderHeaderText: { fontSize: 11, color: '#1a1a00', fontWeight: '600' },
  prColHeader: { flexDirection: 'row', backgroundColor: '#e8f0fe', paddingVertical: 5, paddingHorizontal: 6, borderBottomWidth: 1, borderBottomColor: '#bcd0f5' },
  prTh: { fontSize: 10, fontWeight: '700', color: '#0056b3' },
  prItemRow: { flexDirection: 'row', paddingVertical: 5, paddingHorizontal: 6, borderBottomWidth: 1, borderBottomColor: '#f1f5f9', alignItems: 'flex-start' },
  prItemRowAlt: { backgroundColor: '#f9fafe' },
  prTd: { fontSize: 10, color: '#334155' },
  prOrderTotal: { flexDirection: 'row', paddingVertical: 5, paddingHorizontal: 6, backgroundColor: '#FFF9C4', borderTopWidth: 1, borderTopColor: '#e0cc00' },
  prTotalLabel: { fontSize: 10, fontWeight: '700', color: '#cc0000', textAlign: 'right', paddingRight: 6 },
  prTotalNum: { fontSize: 10, fontWeight: '700', color: '#cc0000', textAlign: 'right' },
  prPartyTotal: { flexDirection: 'row', paddingVertical: 7, paddingHorizontal: 6, backgroundColor: '#e8f0fe', borderTopWidth: 2, borderTopColor: '#0056b3', marginTop: 2, marginBottom: 8 },
  prPartyTotalLabel: { fontSize: 11, fontWeight: '700', color: '#0056b3', paddingRight: 6 },
  prPartyTotalNum: { fontSize: 11, fontWeight: '800', color: '#0056b3', textAlign: 'right' },
});

