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
import { fetchParties, fetchProducts, fetchStockReport } from "../services/api";
import Icon from "../components/Icon";

// ── Date helpers ──────────────────────────────────────────────────────────────
const toApiDate = (d) => d.toISOString().split('T')[0];
const toDisplay = (d) => {
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${dd}/${mm}/${d.getFullYear()}`;
};

const FieldLabel = ({ label }) => <Text style={styles.fieldLabel}>{label}</Text>;

// ── Multi-select searchable list (inside modals) ──────────────────────────────
const MultiSearchList = ({ data, selected, onToggle, labelKey }) => {
  const [search, setSearch] = useState("");
  const filtered = data.filter(item =>
    (item[labelKey] || item.ItemCode || "").toLowerCase().includes(search.toLowerCase())
  );
  return (
    <>
      <View style={styles.searchBar}>
        <Icon name="search" size={14} color="#90a4ae" />
        <TextInput style={styles.searchInput} placeholder="Search..." value={search} onChangeText={setSearch} />
      </View>
      <FlatList
        data={filtered}
        keyExtractor={(item, i) => item.PartyID || item.ItemCode || String(i)}
        renderItem={({ item }) => {
          const id = item.PartyID || item.ItemCode;
          const isChecked = selected.some(s => (s.PartyID || s.ItemCode) === id);
          return (
            <TouchableOpacity style={[styles.listItem, { flexDirection: 'row', alignItems: 'center' }]} onPress={() => onToggle(item)}>
              <View style={[styles.cbBox, isChecked && styles.cbBoxChecked]}>
                {isChecked && <Text style={styles.cbTick}>✓</Text>}
              </View>
              <Text style={styles.listItemText}>{item[labelKey] || item.ItemCode}</Text>
            </TouchableOpacity>
          );
        }}
      />
    </>
  );
};

// ── PDF HTML builder ──────────────────────────────────────────────────────────
const buildPdfHtml = (data, filters, isSummary) => {
  const now = new Date().toLocaleString("en-IN");
  const colHeaders = isSummary
    ? `<tr class="col-header"><th>Item Code</th><th>Product Name</th><th style="text-align:center">Ord Qty</th><th style="text-align:center">Disp Qty</th><th style="text-align:center">Bal Qty</th></tr>`
    : `<tr class="col-header"><th>Order No.</th><th>Date</th><th>Item</th><th style="text-align:center">Ord Qty</th><th style="text-align:center">Disp Qty</th><th style="text-align:center">Bal Qty</th></tr>`;

  let bodyHtml = '';
  let grandOrd = 0, grandDisp = 0, grandBal = 0;

  if (isSummary) {
    // Flat product rows
    bodyHtml = data.map((r, i) => {
      grandOrd  += parseFloat(r.OrderQty)    || 0;
      grandDisp += parseFloat(r.DispatchQty) || 0;
      grandBal  += parseFloat(r.BalQty)      || 0;
      return `<tr style="background:${i % 2 === 0 ? '#f8faff' : '#fff'}">
        <td><b>${r.ItemCode || '-'}</b></td>
        <td>${r.ProductName || '-'}</td>
        <td style="text-align:center">${r.OrderQty ?? '-'}</td>
        <td style="text-align:center">${r.DispatchQty ?? 0}</td>
        <td style="text-align:center;color:#d32f2f;font-weight:700">${r.BalQty ?? '-'}</td>
      </tr>`;
    }).join('');
  } else {
    // Group by VouchNo
    const groups = [];
    const seen = {};
    data.forEach(r => {
      const key = r.VouchNo || r.TransNo || '-';
      if (!seen[key]) { seen[key] = true; groups.push({ key, rows: [] }); }
      groups[groups.length - 1].rows.push(r);
    });

    bodyHtml = groups.map(group => {
      const firstRow = group.rows[0];
      const subOrd  = group.rows.reduce((s, r) => s + (parseFloat(r.OrderQty)    || 0), 0);
      const subDisp = group.rows.reduce((s, r) => s + (parseFloat(r.DispatchQty) || 0), 0);
      const subBal  = group.rows.reduce((s, r) => s + (parseFloat(r.BalQty)      || 0), 0);
      grandOrd += subOrd; grandDisp += subDisp; grandBal += subBal;

      const dataRows = group.rows.map((r, i) => `
        <tr style="background:${i % 2 === 0 ? '#f8faff' : '#fff'}">
          <td>${r.VouchNo || '-'}</td>
          <td>${r.OrderDate || '-'}</td>
          <td>${r.ItemCode ? `<b>${r.ItemCode}</b><br/><small>${r.ProductName || ''}</small>` : '-'}</td>
          <td style="text-align:center">${r.OrderQty ?? '-'}</td>
          <td style="text-align:center">${r.DispatchQty ?? 0}</td>
          <td style="text-align:center;color:#d32f2f;font-weight:700">${r.BalQty ?? '-'}</td>
        </tr>`).join('');

      return `
        <tr class="group-header">
          <td colspan="6">#${firstRow.VouchNo} &nbsp;•&nbsp; ${firstRow.PartyName || ''} &nbsp;•&nbsp; ${firstRow.OrderDate || ''}</td>
        </tr>
        ${colHeaders}
        ${dataRows}
        <tr class="subtotal-row">
          <td colspan="3" style="text-align:right;padding-right:12px;color:#0056b3;font-weight:700">Subtotal</td>
          <td style="text-align:center;color:#0056b3;font-weight:700">${subOrd.toFixed(0)}</td>
          <td style="text-align:center;color:#0056b3;font-weight:700">${subDisp.toFixed(0)}</td>
          <td style="text-align:center;color:#d32f2f;font-weight:700">${subBal.toFixed(0)}</td>
        </tr>`;
    }).join('');
  }

  const grandTotalColspan = isSummary ? 2 : 3;

  return `<!DOCTYPE html><html><head><meta charset="UTF-8"/>
  <style>
    body{font-family:Arial,sans-serif;margin:0;padding:20px;color:#1a237e;}
    .header{background:linear-gradient(135deg,#0056b3,#1976d2);color:#fff;padding:20px 24px;border-radius:10px;margin-bottom:20px;}
    .header h1{margin:0;font-size:22px;letter-spacing:1px;}
    .header p{margin:4px 0 0;font-size:13px;opacity:.85;}
    .mode-badge{display:inline-block;background:${isSummary ? '#43a047' : '#e65100'};color:#fff;border-radius:20px;padding:4px 16px;font-size:12px;font-weight:700;margin-bottom:16px;}
    .meta{display:flex;gap:16px;margin-bottom:16px;flex-wrap:wrap;}
    .meta-box{background:#e3f2fd;border-radius:8px;padding:10px 16px;font-size:12px;}
    .meta-box b{display:block;color:#0056b3;font-size:14px;margin-top:2px;}
    table{width:100%;border-collapse:collapse;font-size:12px;margin-bottom:0;}
    th{background:#0056b3;color:#fff;padding:8px 6px;text-align:left;font-size:11px;letter-spacing:.5px;}
    td{padding:7px 6px;border-bottom:1px solid #e8eaf6;vertical-align:top;}
    .group-header td{background:#0056b3;color:#fff;font-weight:700;font-size:12px;padding:8px 10px;letter-spacing:.3px;border-top:4px solid #fff;}
    .col-header th{background:#1565c0;}
    .subtotal-row td{background:#e8f4fd;border-top:1.5px solid #90caf9;}
    .total-row{background:#e3f2fd!important;font-weight:700;}
    .footer{margin-top:18px;text-align:right;font-size:12px;color:#555;}
    .badge{display:inline-block;background:#0056b3;color:#fff;border-radius:20px;padding:2px 12px;font-size:11px;}
  </style></head><body>
  <div class="header">
    <h1>📊 Stock Report</h1>
    <p>Generated on ${now}</p>
  </div>
  <div class="mode-badge">${isSummary ? '📋 Summary Mode' : '📄 Detail Mode'}</div>
  <div class="meta">
    <div class="meta-box">Period<b>${filters.fromDate} → ${filters.toDate}</b></div>
    <div class="meta-box">Party<b>${filters.partyName || 'All Parties'}</b></div>
    <div class="meta-box">Product<b>${filters.productName || 'All Products'}</b></div>
    <div class="meta-box">Records<b><span class="badge">${data.length}</span></b></div>
  </div>
  <table>
    <tbody>
      ${isSummary ? colHeaders : ''}
      ${bodyHtml}
      <tr class="total-row">
        <td colspan="${grandTotalColspan}" style="text-align:right;padding-right:12px">GRAND TOTAL</td>
        <td style="text-align:center">${grandOrd.toFixed(0)}</td>
        <td style="text-align:center">${grandDisp.toFixed(0)}</td>
        <td style="text-align:center;color:#d32f2f">${grandBal.toFixed(0)}</td>
      </tr>
    </tbody>
  </table>
  <div class="footer">Stock Report • ${now}</div>
</body></html>`;
};

// ── Main Screen ───────────────────────────────────────────────────────────────
export default function StockReportScreen({ navigation }) {
  const [loading, setLoading]         = useState(false);
  const [pdfLoading, setPdfLoading]   = useState(false);
  const [dropdownLoading, setDropdownLoading] = useState(false);
  const [reportData, setReportData]   = useState(null);

  const [allParties, setAllParties]   = useState([]);
  const [allProducts, setAllProducts] = useState([]);
  const [parties, setParties]         = useState([]);
  const [products, setProducts]       = useState([]);

  const today = new Date();
  const [fromDate, setFromDate]             = useState(today);
  const [toDate, setToDate]                 = useState(today);
  const [showFromPicker, setShowFromPicker] = useState(false);
  const [showToPicker, setShowToPicker]     = useState(false);

  const [selectedParties,  setSelectedParties]  = useState([]);
  const [selectedProducts, setSelectedProducts] = useState([]);
  const [isSummary, setIsSummary]               = useState(true);

  const [tempParties,  setTempParties]  = useState([]);
  const [tempProducts, setTempProducts] = useState([]);

  const [showPartyModal,   setShowPartyModal]   = useState(false);
  const [showProductModal, setShowProductModal] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const [pData, prodData] = await Promise.all([fetchParties({ grpName: 'CREDITORS' }), fetchProducts()]);
        setAllParties(pData.data || []);    setParties(pData.data || []);
        setAllProducts(prodData.data || []); setProducts(prodData.data || []);
      } catch (e) { console.error("Failed to load stock dropdowns", e); }
    })();
  }, []);

  const toggleParty = useCallback((party) => {
    setTempParties(prev =>
      prev.some(p => p.PartyID === party.PartyID)
        ? prev.filter(p => p.PartyID !== party.PartyID)
        : [...prev, party]
    );
  }, []);

  const confirmPartySelection = useCallback(async () => {
    setSelectedParties(tempParties); setSelectedProducts([]); setReportData(null);
    setShowPartyModal(false);
    if (tempParties.length === 0) { setProducts(allProducts); return; }
    setDropdownLoading(true);
    try {
      const prodData = await fetchProducts({ partyId: tempParties.map(p => p.PartyID).join(',') });
      setProducts(prodData.data || []);
    } catch (e) { console.error(e); } finally { setDropdownLoading(false); }
  }, [tempParties, allProducts]);

  const toggleProduct = useCallback((product) => {
    setTempProducts(prev =>
      prev.some(p => p.ItemCode === product.ItemCode)
        ? prev.filter(p => p.ItemCode !== product.ItemCode)
        : [...prev, product]
    );
  }, []);

  const confirmProductSelection = useCallback(async () => {
    setSelectedProducts(tempProducts); setReportData(null);
    setShowProductModal(false);
    if (tempProducts.length === 0) { setParties(allParties); return; }
    setDropdownLoading(true);
    try {
      const pData = await fetchParties({ productId: tempProducts.map(p => p.ItemCode).join(','), grpName: 'CREDITORS' });
      setParties(pData.data || []);
    } catch (e) { console.error(e); } finally { setDropdownLoading(false); }
  }, [tempProducts, allParties]);

  const handleReset = () => {
    setSelectedParties([]); setSelectedProducts([]);
    setTempParties([]); setTempProducts([]);
    setFromDate(new Date()); setToDate(new Date());
    setIsSummary(true); setReportData(null);
    setParties(allParties); setProducts(allProducts);
  };

  const handleGenerateReport = async () => {
    setLoading(true); setReportData(null);
    try {
      const res = await fetchStockReport({
        fromDate:  toApiDate(fromDate),
        toDate:    toApiDate(toDate),
        partyId:   selectedParties.length  > 0 ? selectedParties.map(p => p.PartyID).join(',')   : 'All',
        productId: selectedProducts.length > 0 ? selectedProducts.map(p => p.ItemCode).join(',') : 'All',
        summary:   isSummary,
      });
      if (res.success && res.data?.length > 0) setReportData(res.data);
      else Alert.alert("No Data", "No records found for the selected filters.");
    } catch (e) { Alert.alert("Error", "Failed to generate stock report."); }
    finally { setLoading(false); }
  };

  const handleDownloadPdf = async () => {
    if (!reportData) return;
    setPdfLoading(true);
    try {
      const partyLabel   = selectedParties.length  > 0 ? selectedParties.map(p => p.PartyName).join(', ')  : null;
      const productLabel = selectedProducts.length > 0 ? selectedProducts.map(p => p.ItemCode).join(', ')  : null;
      const html = buildPdfHtml(reportData, {
        fromDate: toDisplay(fromDate), toDate: toDisplay(toDate),
        partyName: partyLabel, productName: productLabel,
      }, isSummary);
      const { uri } = await Print.printToFileAsync({ html, base64: false });
      const safeParty   = (partyLabel   || 'AllParties').replace(/[^a-zA-Z0-9]/g, '_');
      const safeProduct = (productLabel || 'AllProducts').replace(/[^a-zA-Z0-9]/g, '_');
      const today = toDisplay(new Date()).replace(/\//g, '-');
      const mode = isSummary ? 'Summary' : 'Detail';
      const fileName = `Stock_${mode}_${safeParty}_${safeProduct}_${today}.pdf`;
      const destUri = `${FileSystem.cacheDirectory}${fileName}`;
      await FileSystem.copyAsync({ from: uri, to: destUri });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(destUri, { mimeType: "application/pdf", dialogTitle: "Stock Report", UTI: "com.adobe.pdf" });
      } else {
        Alert.alert("PDF Saved", `Saved as: ${fileName}`);
      }
    } catch (e) { Alert.alert("Error", "Failed to generate PDF."); }
    finally { setPdfLoading(false); }
  };

  // ── Grouped render for Detail mode ────────────────────────────────────────
  const renderDetailResults = () => {
    const groups = [];
    const seen = {};
    reportData.forEach(r => {
      const key = r.VouchNo || r.TransNo || '-';
      if (!seen[key]) { seen[key] = true; groups.push({ key, rows: [] }); }
      groups[groups.length - 1].rows.push(r);
    });

    const ColHeader = () => (
      <View style={styles.tableHeader}>
        <Text style={[styles.th, { flex: 1.2 }]}>Order</Text>
        <Text style={[styles.th, { flex: 1.8 }]}>Item</Text>
        <Text style={[styles.th, { flex: 0.7, textAlign: 'center' }]}>Ord</Text>
        <Text style={[styles.th, { flex: 0.7, textAlign: 'center' }]}>Disp</Text>
        <Text style={[styles.th, { flex: 0.7, textAlign: 'center' }]}>Bal</Text>
      </View>
    );

    return (
      <>
        {groups.map(group => {
          const firstRow = group.rows[0];
          const subOrd  = group.rows.reduce((s, r) => s + (parseFloat(r.OrderQty)    || 0), 0);
          const subDisp = group.rows.reduce((s, r) => s + (parseFloat(r.DispatchQty) || 0), 0);
          const subBal  = group.rows.reduce((s, r) => s + (parseFloat(r.BalQty)      || 0), 0);
          return (
            <View key={group.key}>
              <View style={styles.orderGroupHeader}>
                <Text style={styles.orderGroupTitle}>
                  {`#${firstRow.VouchNo}  •  ${firstRow.PartyName || ''}  •  ${firstRow.OrderDate || ''}`}
                </Text>
              </View>
              <ColHeader />
              {group.rows.map((r, i) => (
                <View key={i} style={[styles.tableRow, i % 2 === 0 && { backgroundColor: '#f8faff' }]}>
                  <View style={{ flex: 1.2 }}>
                    <Text style={styles.tdBold}>{r.VouchNo || '-'}</Text>
                    <Text style={styles.tdSub}>{r.OrderDate || ''}</Text>
                  </View>
                  <View style={{ flex: 1.8 }}>
                    <Text style={styles.tdBold} numberOfLines={1}>{r.ItemCode || '-'}</Text>
                    <Text style={styles.tdSub} numberOfLines={2}>{r.ProductName}</Text>
                  </View>
                  <Text style={[styles.td, { flex: 0.7, textAlign: 'center' }]}>{r.OrderQty ?? '-'}</Text>
                  <Text style={[styles.td, { flex: 0.7, textAlign: 'center' }]}>{r.DispatchQty ?? 0}</Text>
                  <Text style={[styles.tdBal, { flex: 0.7 }]}>{r.BalQty ?? '-'}</Text>
                </View>
              ))}
              <View style={styles.subtotalRow}>
                <Text style={[styles.tdBold, { flex: 3.0, color: '#0056b3' }]}>Subtotal</Text>
                <Text style={[styles.td, { flex: 0.7, textAlign: 'center', fontWeight: '700', color: '#0056b3' }]}>{subOrd.toFixed(0)}</Text>
                <Text style={[styles.td, { flex: 0.7, textAlign: 'center', fontWeight: '700', color: '#0056b3' }]}>{subDisp.toFixed(0)}</Text>
                <Text style={[styles.tdBal, { flex: 0.7, color: '#c62828', fontSize: 13 }]}>{subBal.toFixed(0)}</Text>
              </View>
            </View>
          );
        })}
        <View style={[styles.tableRow, { backgroundColor: '#e3f2fd' }]}>
          <Text style={[styles.tdBold, { flex: 3.0 }]}>GRAND TOTAL</Text>
          <Text style={[styles.td, { flex: 0.7, textAlign: 'center', fontWeight: '700' }]}>{reportData.reduce((s, r) => s + (parseFloat(r.OrderQty)    || 0), 0).toFixed(0)}</Text>
          <Text style={[styles.td, { flex: 0.7, textAlign: 'center', fontWeight: '700' }]}>{reportData.reduce((s, r) => s + (parseFloat(r.DispatchQty) || 0), 0).toFixed(0)}</Text>
          <Text style={[styles.tdBal, { flex: 0.7, fontSize: 14 }]}>{reportData.reduce((s, r) => s + (parseFloat(r.BalQty)      || 0), 0).toFixed(0)}</Text>
        </View>
      </>
    );
  };

  const renderSummaryResults = () => (
    <>
      <View style={styles.tableHeader}>
        <Text style={[styles.th, { flex: 1.2 }]}>Item</Text>
        <Text style={[styles.th, { flex: 2 }]}>Product Name</Text>
        <Text style={[styles.th, { flex: 0.7, textAlign: 'center' }]}>Ord</Text>
        <Text style={[styles.th, { flex: 0.7, textAlign: 'center' }]}>Disp</Text>
        <Text style={[styles.th, { flex: 0.7, textAlign: 'center' }]}>Bal</Text>
      </View>
      {reportData.map((r, i) => (
        <View key={i} style={[styles.tableRow, i % 2 === 0 && { backgroundColor: '#f8faff' }]}>
          <Text style={[styles.tdBold, { flex: 1.2 }]} numberOfLines={1}>{r.ItemCode || '-'}</Text>
          <Text style={[styles.td, { flex: 2 }]} numberOfLines={2}>{r.ProductName || '-'}</Text>
          <Text style={[styles.td, { flex: 0.7, textAlign: 'center' }]}>{r.OrderQty ?? '-'}</Text>
          <Text style={[styles.td, { flex: 0.7, textAlign: 'center' }]}>{r.DispatchQty ?? 0}</Text>
          <Text style={[styles.tdBal, { flex: 0.7 }]}>{r.BalQty ?? '-'}</Text>
        </View>
      ))}
      <View style={[styles.tableRow, { backgroundColor: '#e3f2fd' }]}>
        <Text style={[styles.tdBold, { flex: 3.2 }]}>TOTAL</Text>
        <Text style={[styles.td, { flex: 0.7, textAlign: 'center', fontWeight: '700' }]}>{reportData.reduce((s, r) => s + (parseFloat(r.OrderQty)    || 0), 0).toFixed(0)}</Text>
        <Text style={[styles.td, { flex: 0.7, textAlign: 'center', fontWeight: '700' }]}>{reportData.reduce((s, r) => s + (parseFloat(r.DispatchQty) || 0), 0).toFixed(0)}</Text>
        <Text style={[styles.tdBal, { flex: 0.7, fontSize: 14 }]}>{reportData.reduce((s, r) => s + (parseFloat(r.BalQty)      || 0), 0).toFixed(0)}</Text>
      </View>
    </>
  );

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar backgroundColor="#0056b3" barStyle="light-content" />
      <View style={styles.header}>
        <TouchableOpacity style={styles.headerBack} onPress={() => navigation.goBack()}>
          <Icon name="back" size={22} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Stock Report</Text>
        <TouchableOpacity onPress={handleReset} style={{ padding: 4 }}>
          <Text style={{ color: '#fff', fontSize: 13, fontWeight: '700' }}>RESET</Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Filters</Text>

          {dropdownLoading && (
            <View style={styles.cascadeBar}>
              <ActivityIndicator size="small" color="#0056b3" />
              <Text style={styles.cascadeText}>Updating filters…</Text>
            </View>
          )}

          {/* Dates */}
          <View style={styles.row}>
            <View style={styles.halfCol}>
              <FieldLabel label="FROM DATE" />
              <TouchableOpacity style={styles.dateBtn} onPress={() => { setShowFromPicker(true); setReportData(null); }}>
                <Icon name="calendar" size={15} color="#0056b3" />
                <Text style={styles.dateBtnText}>{toDisplay(fromDate)}</Text>
              </TouchableOpacity>
              {showFromPicker && (
                <DateTimePicker value={fromDate} mode="date"
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
                <DateTimePicker value={toDate} mode="date"
                  display={Platform.OS === 'ios' ? 'inline' : 'calendar'}
                  onChange={(_, d) => { setShowToPicker(Platform.OS === 'ios'); if (d) setToDate(d); }}
                  minimumDate={fromDate}
                />
              )}
            </View>
          </View>

          {/* Party */}
          <FieldLabel label="PARTY NAME" />
          <TouchableOpacity style={styles.dropdown} onPress={() => { setTempParties(selectedParties); setShowPartyModal(true); }}>
            <Text style={selectedParties.length > 0 ? styles.dropdownValue : styles.dropdownPlaceholder}>
              {selectedParties.length > 0 ? `${selectedParties.length} party(s) selected` : 'All Parties'}
            </Text>
            <Icon name="chevron" size={16} color="#90a4ae" />
          </TouchableOpacity>

          {/* Product */}
          <FieldLabel label="PRODUCT" />
          <TouchableOpacity style={styles.dropdown} onPress={() => { setTempProducts(selectedProducts); setShowProductModal(true); }}>
            <Text style={selectedProducts.length > 0 ? styles.dropdownValue : styles.dropdownPlaceholder}>
              {selectedProducts.length > 0 ? `${selectedProducts.length} product(s) selected` : 'All Products'}
            </Text>
            <Icon name="chevron" size={16} color="#90a4ae" />
          </TouchableOpacity>

          {/* Summary toggle */}
          <FieldLabel label="REPORT MODE" />
          <TouchableOpacity style={[styles.checkboxContainer, isSummary && styles.checkboxActive]}
            onPress={() => { setIsSummary(!isSummary); setReportData(null); }}>
            <View style={[styles.checkbox, isSummary && styles.checkboxFilled]} />
            <Text style={[styles.checkboxLabel, isSummary && { color: '#0056b3' }]}>
              {isSummary ? '📋 Summary Only (product totals)' : '📄 Detailed (per order)'}
            </Text>
          </TouchableOpacity>

          {/* Chips */}
          {(selectedParties.length > 0 || selectedProducts.length > 0) && (
            <View style={styles.chipRow}>
              {selectedParties.map(p => (
                <View key={p.PartyID} style={styles.chip}><Text style={styles.chipText}>{p.PartyName}</Text></View>
              ))}
              {selectedProducts.map(p => (
                <View key={p.ItemCode} style={styles.chip}><Text style={styles.chipText}>{p.ItemCode}</Text></View>
              ))}
            </View>
          )}

          <TouchableOpacity style={styles.generateBtn} onPress={handleGenerateReport} disabled={loading}>
            {loading
              ? <ActivityIndicator color="#fff" />
              : <><Icon name="reports" size={18} color="#fff" /><Text style={styles.generateBtnText}>GENERATE REPORT</Text></>}
          </TouchableOpacity>
        </View>

        {/* Results */}
        {reportData && (
          <View style={styles.resultsCard}>
            <View style={styles.resultsHeader}>
              <View>
                <Text style={styles.resultsTitle}>
                  {isSummary ? '📋 Summary Report' : '📄 Detail Report'}
                </Text>
                <Text style={styles.resultsCount}>{reportData.length} record(s) found</Text>
              </View>
              <TouchableOpacity style={styles.pdfBtn} onPress={handleDownloadPdf} disabled={pdfLoading}>
                {pdfLoading
                  ? <ActivityIndicator size="small" color="#fff" />
                  : <Text style={styles.pdfBtnText}>📄 PDF</Text>}
              </TouchableOpacity>
            </View>
            {isSummary ? renderSummaryResults() : renderDetailResults()}
          </View>
        )}
      </ScrollView>

      {/* Party modal */}
      <Modal visible={showPartyModal} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Select Parties</Text>
              <TouchableOpacity onPress={() => setShowPartyModal(false)}><Text style={styles.closeText}>Cancel</Text></TouchableOpacity>
            </View>
            {tempParties.length > 0 && (
              <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#e3f2fd', borderRadius: 10, padding: 10, marginBottom: 12 }}>
                <Text style={{ color: '#0056b3', fontWeight: '700', flex: 1 }}>{tempParties.length} party(s) selected</Text>
                <TouchableOpacity onPress={() => setTempParties([])}><Text style={{ color: '#e91e63', fontWeight: '600', fontSize: 12 }}>Clear all</Text></TouchableOpacity>
              </View>
            )}
            <MultiSearchList data={parties} selected={tempParties} onToggle={toggleParty} labelKey="PartyName" />
            <TouchableOpacity style={styles.doneBtn} onPress={confirmPartySelection}>
              <Text style={styles.doneBtnText}>DONE  ({tempParties.length} selected)</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Product modal */}
      <Modal visible={showProductModal} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Select Products</Text>
              <TouchableOpacity onPress={() => setShowProductModal(false)}><Text style={styles.closeText}>Cancel</Text></TouchableOpacity>
            </View>
            {tempProducts.length > 0 && (
              <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#e3f2fd', borderRadius: 10, padding: 10, marginBottom: 12 }}>
                <Text style={{ color: '#0056b3', fontWeight: '700', flex: 1 }}>{tempProducts.length} product(s) selected</Text>
                <TouchableOpacity onPress={() => setTempProducts([])}><Text style={{ color: '#e91e63', fontWeight: '600', fontSize: 12 }}>Clear all</Text></TouchableOpacity>
              </View>
            )}
            <MultiSearchList data={products} selected={tempProducts} onToggle={toggleProduct} labelKey="ProductName" />
            <TouchableOpacity style={styles.doneBtn} onPress={confirmProductSelection}>
              <Text style={styles.doneBtnText}>DONE  ({tempProducts.length} selected)</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
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
  dateBtn: { borderWidth: 1.5, borderColor: '#e0e7ef', borderRadius: 10, paddingHorizontal: 12, height: 46, flexDirection: 'row', alignItems: 'center', backgroundColor: '#fafcff', gap: 8 },
  dateBtnText: { fontSize: 14, color: '#263238', fontWeight: '500', flex: 1 },
  dropdown: { borderWidth: 1.5, borderColor: "#e0e7ef", borderRadius: 10, paddingHorizontal: 12, flexDirection: "row", alignItems: "center", backgroundColor: "#fafcff", height: 46 },
  dropdownPlaceholder: { flex: 1, fontSize: 14, color: "#b0bec5" },
  dropdownValue: { flex: 1, fontSize: 14, color: "#263238", fontWeight: "500" },
  checkboxContainer: { flexDirection: "row", alignItems: "center", borderWidth: 1.5, borderColor: "#e0e7ef", borderRadius: 10, paddingHorizontal: 12, height: 46, backgroundColor: "#fafcff" },
  checkboxActive: { borderColor: "#0056b3", backgroundColor: "#e3f2fd" },
  checkbox: { width: 16, height: 16, borderRadius: 3, borderWidth: 2, borderColor: "#90a4ae", marginRight: 8 },
  checkboxFilled: { backgroundColor: "#0056b3", borderColor: "#0056b3" },
  checkboxLabel: { fontSize: 12, color: "#78909c", fontWeight: "600", flex: 1 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 14 },
  chip: { backgroundColor: '#e3f2fd', borderRadius: 20, paddingHorizontal: 12, paddingVertical: 4 },
  chipText: { color: '#0056b3', fontSize: 12, fontWeight: '600' },
  generateBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", backgroundColor: "#0056b3", borderRadius: 12, paddingVertical: 15, marginTop: 20, elevation: 4, gap: 10 },
  generateBtnText: { color: "#fff", fontWeight: "800", fontSize: 15 },
  // Results
  resultsCard: { backgroundColor: "#fff", borderRadius: 16, elevation: 3, overflow: 'hidden' },
  resultsHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderBottomColor: '#e8eaf6' },
  resultsTitle: { fontSize: 15, fontWeight: '800', color: '#0056b3' },
  resultsCount: { fontSize: 12, color: '#78909c', marginTop: 2 },
  pdfBtn: { backgroundColor: '#0056b3', borderRadius: 10, paddingHorizontal: 16, paddingVertical: 8 },
  pdfBtnText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  tableHeader: { flexDirection: 'row', backgroundColor: '#0056b3', paddingVertical: 10, paddingHorizontal: 12 },
  th: { color: '#fff', fontSize: 11, fontWeight: '700', letterSpacing: 0.5 },
  tableRow: { flexDirection: 'row', paddingVertical: 10, paddingHorizontal: 12, borderBottomWidth: 1, borderBottomColor: '#f0f2f5', alignItems: 'center' },
  td: { fontSize: 12, color: '#37474f' },
  tdBold: { fontSize: 12, color: '#1a237e', fontWeight: '700' },
  tdSub: { fontSize: 10, color: '#78909c', marginTop: 1 },
  tdBal: { fontSize: 12, color: '#c62828', fontWeight: '800', textAlign: 'center' },
  orderGroupHeader: { backgroundColor: '#0056b3', paddingVertical: 7, paddingHorizontal: 12, marginTop: 4 },
  orderGroupTitle: { color: '#fff', fontSize: 11, fontWeight: '700', letterSpacing: 0.4 },
  subtotalRow: { flexDirection: 'row', paddingVertical: 8, paddingHorizontal: 12, backgroundColor: '#e8f4fd', borderTopWidth: 1.5, borderTopColor: '#90caf9', marginBottom: 2 },
  // Modals
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" },
  modalContent: { backgroundColor: "#fff", borderTopLeftRadius: 24, borderTopRightRadius: 24, height: "70%", padding: 24 },
  modalHeader: { flexDirection: "row", justifyContent: "space-between", marginBottom: 20 },
  modalTitle: { fontSize: 18, fontWeight: "bold", color: "#0056b3" },
  closeText: { color: "#e91e63", fontWeight: "bold" },
  searchBar: { flexDirection: "row", alignItems: "center", backgroundColor: "#f5f7fa", borderRadius: 12, paddingHorizontal: 12, height: 48, marginBottom: 16 },
  searchInput: { flex: 1, marginLeft: 10, fontSize: 15 },
  listItem: { paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: "#f0f2f5" },
  listItemText: { fontSize: 15, color: "#333", fontWeight: "500" },
  cbBox: { width: 22, height: 22, borderRadius: 5, borderWidth: 2, borderColor: '#b0bec5', marginRight: 12, alignItems: 'center', justifyContent: 'center' },
  cbBoxChecked: { backgroundColor: '#0056b3', borderColor: '#0056b3' },
  cbTick: { color: '#fff', fontSize: 13, fontWeight: '800', lineHeight: 16 },
  doneBtn: { backgroundColor: '#0056b3', borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginTop: 14 },
  doneBtnText: { color: '#fff', fontWeight: '800', fontSize: 15, letterSpacing: 0.5 },
});
