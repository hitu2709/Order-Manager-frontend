import React, { useState, useEffect } from "react";
import {
  View, Text, TextInput, TouchableOpacity, ScrollView,
  StyleSheet, SafeAreaView, StatusBar, Alert, ActivityIndicator,
  Modal, FlatList, Platform,
} from "react-native";
import DateTimePicker from "@react-native-community/datetimepicker";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import * as FileSystem from "expo-file-system";
import { fetchDispatchParties, fetchDispatchNumbers, fetchDispatchProducts, fetchDispatchReport } from "../services/api";
import Icon from "../components/Icon";

const FieldLabel = ({ label }) => <Text style={styles.fieldLabel}>{label}</Text>;

const toDisplay = (d) => d.toLocaleDateString("en-GB");
const toApiDate = (d) => d.toISOString().split("T")[0];
const fmt2 = (v) => parseFloat(v || 0).toFixed(2);
const fmtN = (v) => parseFloat(v || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 });

// ─── Helper: read column value by multiple possible names ────────────────────
const g = (row, ...keys) => {
  for (const k of keys) { if (row[k] !== undefined && row[k] !== null) return row[k]; }
  return null;
};

// ─── Multi-Select Dropdown ───────────────────────────────────────────────────
const MultiSelectDropdown = ({ visible, data, selected, onDone, onClose, title, placeholder, renderLabel, idKey }) => {
  const [search, setSearch] = useState("");
  const [localSel, setLocalSel] = useState([]);
  useEffect(() => { if (visible) setLocalSel(selected); }, [visible]);

  const filtered = data.filter(item => renderLabel(item).toLowerCase().includes(search.toLowerCase()));
  const isSel = (item) => localSel.some(s => String(s[idKey]) === String(item[idKey]));
  const toggle = (item) => {
    if (isSel(item)) setLocalSel(prev => prev.filter(s => String(s[idKey]) !== String(item[idKey])));
    else             setLocalSel(prev => [...prev, item]);
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>{title}</Text>
            <TouchableOpacity onPress={() => { onClose(); setSearch(""); }}>
              <Text style={styles.closeText}>Cancel</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.actionRow}>
            <TouchableOpacity style={styles.actionBtn} onPress={() => setLocalSel([...data])}>
              <Text style={styles.actionBtnText}>Select All</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.actionBtn, { backgroundColor: "#fee2e2" }]} onPress={() => setLocalSel([])}>
              <Text style={[styles.actionBtnText, { color: "#dc2626" }]}>Clear</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.actionBtn, { backgroundColor: "#0056b3", flex: 1 }]}
              onPress={() => { onDone(localSel); setSearch(""); onClose(); }}>
              <Text style={[styles.actionBtnText, { color: "#fff" }]}>✓ Done ({localSel.length})</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.searchBar}>
            <Icon name="search" size={14} color="#90a4ae" />
            <TextInput style={styles.searchInput} placeholder={placeholder} value={search} onChangeText={setSearch} autoFocus />
          </View>
          <FlatList
            data={filtered}
            keyExtractor={(_, i) => i.toString()}
            renderItem={({ item }) => (
              <TouchableOpacity style={styles.listItem} onPress={() => toggle(item)}>
                <View style={[styles.checkbox, isSel(item) && styles.checkboxSel]}>
                  {isSel(item) && <Text style={{ color: "#fff", fontSize: 11, fontWeight: "700" }}>✓</Text>}
                </View>
                <Text style={styles.listItemText} numberOfLines={2}>{renderLabel(item)}</Text>
              </TouchableOpacity>
            )}
          />
        </View>
      </View>
    </Modal>
  );
};

const MultiBtn = ({ selected, renderLabel, onPress }) => {
  let text = "All";
  if (selected.length === 1) text = renderLabel(selected[0]);
  else if (selected.length > 1) text = `${selected.length} selected`;
  return (
    <TouchableOpacity style={styles.selectBtn} onPress={onPress}>
      <Text style={[styles.selectBtnText, selected.length > 0 && styles.selectBtnActive]} numberOfLines={1}>{text}</Text>
      <Icon name="down" size={12} color="#64748b" />
    </TouchableOpacity>
  );
};

// ─── PDF HTML Builder ────────────────────────────────────────────────────────
const buildDispatchPdfHtml = (data, filters) => {
  const now = new Date().toLocaleString("en-IN");
  const f2 = (v) => parseFloat(v || 0).toFixed(2);
  const fN = (v) => parseFloat(v || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 });

  // Group the flat rows same as groupRows()
  const g2 = (row, ...keys) => { for (const k of keys) { if (row[k] !== undefined && row[k] !== null) return row[k]; } return null; };
  const partyMap = new Map();
  data.forEach(row => {
    const pCode = g2(row, "ac_code") || "";
    const pName = g2(row, "ac_name") || "Unknown";
    const dKey  = String(g2(row, "Trans_no", "challan_no") || "");
    const dNo   = g2(row, "challan_no") || "";
    const dDate = g2(row, "Date") || "";
    const lrNo  = g2(row, "LRNo") || "-";
    const lrDt  = g2(row, "LRDate") || "";
    const trans = g2(row, "Transport") || "-";
    const ordNo = g2(row, "ord_no") || "";
    const iCode = g2(row, "Prod_code") || "";
    const iName = g2(row, "ProdName") || "";
    const dQty  = g2(row, "DispQty") || 0;
    const oQty  = g2(row, "OriQty") || "";
    const rate  = g2(row, "Rate") || 0;
    const disc  = g2(row, "Disc") || 0;
    const amt   = g2(row, "Amt") || 0;
    if (!partyMap.has(pCode + pName)) partyMap.set(pCode + pName, { pName, dispatches: new Map() });
    const party = partyMap.get(pCode + pName);
    if (!party.dispatches.has(dKey)) party.dispatches.set(dKey, { dNo, dDate, lrNo, lrDt, trans, ordNo, items: [] });
    const disp = party.dispatches.get(dKey);
    if (iCode || iName) disp.items.push({ iCode, iName, dQty, oQty, rate, disc, amt });
  });

  let partyHtml = "";
  let dispCounter = 1;
  partyMap.forEach(party => {
    let partyQty = 0, partyAmt = 0, partyDisc = 0;
    let dispHtml = "";
    party.dispatches.forEach(disp => {
      const subQty = disp.items.reduce((s, it) => s + parseFloat(it.dQty || 0), 0);
      const subAmt = disp.items.reduce((s, it) => s + parseFloat(it.amt || 0), 0);
      const subDisc = disp.items.reduce((s, it) => s + parseFloat(it.disc || 0), 0);
      partyQty += subQty; partyAmt += subAmt; partyDisc += subDisc;
      const dateStr = disp.dDate ? (typeof disp.dDate === "string" ? disp.dDate : new Date(disp.dDate).toLocaleDateString("en-GB")) : "-";
      const lrDtStr = disp.lrDt  ? (typeof disp.lrDt  === "string" ? disp.lrDt  : new Date(disp.lrDt).toLocaleDateString("en-GB"))  : "-";
      const itemRows = disp.items.map((it, ii) => `
        <tr style="background:${ii%2===0?'#f8faff':'#fff'}">
          <td>${ii+1}</td>
          <td><b>${it.iCode}</b><br/><small>${it.iName}</small></td>
          <td style="text-align:right">${parseFloat(it.dQty||0).toFixed(0)}</td>
          <td style="text-align:right">${it.oQty||''}</td>
          <td style="text-align:right">${fN(it.rate)}</td>
          <td style="text-align:right">${fN(it.disc)}</td>
          <td style="text-align:right;font-weight:700">${fN(it.amt)}</td>
        </tr>`).join("");
      dispHtml += `
        <tr class="disp-header">
          <td colspan="7">
            <b>Dispatch No. ${dispCounter}</b> &nbsp;|&nbsp; Date: ${dateStr}
            &nbsp;|&nbsp; Order No: ${disp.ordNo}
            &nbsp;|&nbsp; Total: ${fN(subAmt)}
          </td>
        </tr>
        <tr class="disp-sub">
          <td colspan="7">LR No: ${disp.lrNo} &nbsp;|&nbsp; LR Date: ${lrDtStr} &nbsp;|&nbsp; Transport: ${disp.trans}</td>
        </tr>
        <tr class="col-header">
          <th>Sr</th><th>Item Code / Name</th><th style="text-align:right">Disp Qty</th>
          <th style="text-align:right">Ori Qty</th><th style="text-align:right">Rate</th>
          <th style="text-align:right">Disc</th><th style="text-align:right">Amount</th>
        </tr>
        ${itemRows}
        <tr class="subtotal-row">
          <td colspan="2" style="text-align:right;font-weight:700;color:#0056b3">Subtotal</td>
          <td style="text-align:right;font-weight:700;color:#cc0000">${subQty.toFixed(0)}</td>
          <td></td><td></td>
          <td style="text-align:right;font-weight:700;color:#cc0000">${fN(subDisc)}</td>
          <td style="text-align:right;font-weight:700;color:#cc0000">${fN(subAmt)}</td>
        </tr>`;
      dispCounter++;
    });
    partyHtml += `
      <tr class="party-header"><td colspan="7">Party: ${party.pName}</td></tr>
      ${dispHtml}
      <tr class="party-total">
        <td colspan="2" style="font-weight:700">Party Wise Total</td>
        <td style="text-align:right;font-weight:800">${partyQty.toFixed(0)}</td>
        <td></td><td></td>
        <td style="text-align:right;font-weight:800">${fN(partyDisc)}</td>
        <td style="text-align:right;font-weight:800">${fN(partyAmt)}</td>
      </tr>`;
  });

  return `<!DOCTYPE html><html><head><meta charset="UTF-8"/>
  <style>
    body{font-family:Arial,sans-serif;margin:0;padding:20px;color:#1a237e;font-size:12px;}
    .header{background:linear-gradient(135deg,#0056b3,#1976d2);color:#fff;padding:20px 24px;border-radius:10px;margin-bottom:20px;}
    .header h1{margin:0;font-size:22px;letter-spacing:1px;}
    .header p{margin:4px 0 0;font-size:13px;opacity:.85;}
    .meta{display:flex;gap:12px;margin-bottom:16px;flex-wrap:wrap;}
    .meta-box{background:#e3f2fd;border-radius:8px;padding:8px 14px;font-size:11px;}
    .meta-box b{display:block;color:#0056b3;font-size:13px;margin-top:2px;}
    table{width:100%;border-collapse:collapse;margin-bottom:0;}
    td,th{padding:6px 8px;border-bottom:1px solid #e8eaf6;vertical-align:top;}
    .party-header td{background:#1565c0;color:#fff;font-weight:700;font-size:13px;padding:8px 10px;border-top:4px solid #fff;}
    .disp-header td{background:#FFF176;color:#1a1a00;font-size:11px;padding:6px 8px;border-bottom:1px solid #e0cc00;}
    .disp-sub td{background:#FFFDE7;color:#555;font-size:10px;padding:4px 8px;border-bottom:1px solid #e0cc00;}
    .col-header th{background:#0056b3;color:#fff;font-size:10px;letter-spacing:.4px;text-align:left;}
    .subtotal-row td{background:#FFF9C4;border-top:1.5px solid #e0cc00;}
    .party-total td{background:#e3f2fd;border-top:2px solid #0056b3;font-size:12px;}
    .footer{margin-top:18px;text-align:right;font-size:11px;color:#555;}
  </style></head><body>
  <div class="header"><h1>📦 Dispatch Report</h1><p>Generated on ${now}</p></div>
  <div class="meta">
    <div class="meta-box">Period<b>${filters.fromDate} → ${filters.toDate}</b></div>
    <div class="meta-box">Party<b>${filters.partyLabel || 'All Parties'}</b></div>
    <div class="meta-box">Records<b>${data.length} rows</b></div>
  </div>
  <table><tbody>${partyHtml}</tbody></table>
  <div class="footer">Dispatch Report • ${now}</div>
</body></html>`;
};

function groupRows(rows) {
  const partyMap = new Map();

  rows.forEach(row => {
    // Flexible column reading
    const partyCode = g(row, "ac_code") || "";
    const partyName = g(row, "ac_name") || "Unknown Party";

    // Dispatch grouping key — use challan_no (the dispatch serial for the day)
    const dispKey   = String(g(row, "Trans_no", "challan_no") || "");
    const dispNo    = g(row, "challan_no") || "";
    const dispDate  = g(row, "Date") || "";
    const packChrg  = 0;  // Not in SP
    const vatAmt    = 0;  // Not in SP
    const lrNo      = g(row, "LRNo") || "-";
    const lrDate    = g(row, "LRDate") || "";
    const transport = g(row, "Transport") || "-";
    const ordNo     = g(row, "ord_no") || "";

    // Item fields — exact SP column names
    const sr       = g(row, "ord_sr_no") || "";
    const itemCode = g(row, "Prod_code") || "";
    const itemName = g(row, "ProdName") || "";
    const dispQty  = g(row, "DispQty") || 0;
    const ordQty   = g(row, "OriQty") || "";
    const rate     = g(row, "Rate") || 0;
    const disc     = g(row, "Disc") || 0;
    const amount   = g(row, "Amt") || 0;

    // Build party
    if (!partyMap.has(partyCode + partyName)) {
      partyMap.set(partyCode + partyName, { partyCode, partyName, dispatchMap: new Map() });
    }
    const party = partyMap.get(partyCode + partyName);

    // Build dispatch (totalAmt calculated from items sum)
    if (!party.dispatchMap.has(dispKey)) {
      party.dispatchMap.set(dispKey, {
        dispKey, dispNo, dispDate, packChrg, vatAmt,
        lrNo, lrDate, transport, ordNo, items: []
      });
    }
    const dispatch = party.dispatchMap.get(dispKey);

    // Add item
    if (itemCode || itemName) {
      dispatch.items.push({ sr, itemCode, itemName, dispQty, ordQty, rate, disc, amount });
    }
  });

  // Convert maps to arrays, add sequential dispatch numbers per party
  const parties = [];
  partyMap.forEach(party => {
    const dispatches = [];
    let dispCounter = 1;
    party.dispatchMap.forEach(d => {
      dispatches.push({ ...d, seqNo: dispCounter++ });
    });
    parties.push({ ...party, dispatches });
  });

  return parties;
}

// ─── Crystal Report–style Report View ────────────────────────────────────────
const ReportView = ({ data }) => {
  const parties = groupRows(data);

  return (
    <ScrollView horizontal>
      <View style={{ minWidth: 700 }}>
        {parties.map((party, pi) => {
          // Party totals — calculated from all item amounts
          const partyTotalQty  = party.dispatches.reduce((s, d) => s + d.items.reduce((si, it) => si + parseFloat(it.dispQty || 0), 0), 0);
          const partyTotalAmt  = party.dispatches.reduce((s, d) => s + d.items.reduce((si, it) => si + parseFloat(it.amount || 0), 0), 0);
          const partyTotalDisc = party.dispatches.reduce((s, d) => s + d.items.reduce((si, it) => si + parseFloat(it.disc || 0), 0), 0);
          const partyTotalRate = party.dispatches.reduce((s, d) => s + d.items.reduce((si, it) => si + parseFloat(it.rate || 0), 0), 0);

          return (
            <View key={pi} style={styles.partyBlock}>
              {/* Party Header (blue) */}
              <View style={styles.partyHeader}>
                <Text style={styles.partyHeaderText}>Party Name:   {party.partyName}</Text>
              </View>

              {party.dispatches.map((disp, di) => {
                const subQty = disp.items.reduce((s, it) => s + parseFloat(it.dispQty || 0), 0);
                const subAmt = disp.items.reduce((s, it) => s + parseFloat(it.amount || 0), 0);
                const subDisc = disp.items.reduce((s, it) => s + parseFloat(it.disc || 0), 0);
                const subRate = disp.items.reduce((s, it) => s + parseFloat(it.rate || 0), 0);

                const dateStr = disp.dispDate
                  ? (typeof disp.dispDate === "string" ? disp.dispDate : new Date(disp.dispDate).toLocaleDateString("en-GB"))
                  : "-";
                const lrDateStr = disp.lrDate
                  ? (typeof disp.lrDate === "string" ? disp.lrDate : new Date(disp.lrDate).toLocaleDateString("en-GB"))
                  : "-";

                return (
                  <View key={di}>
                    {/* Dispatch Header row 1 (yellow) */}
                    <View style={styles.dispHeader}>
                      <Text style={styles.dispHeaderText}>Dispatch No. {disp.seqNo}{"          "}</Text>
                      <Text style={styles.dispHeaderText}>Date :- {dateStr}{"          "}</Text>
                      <Text style={styles.dispHeaderText}>Packing Charge :- {fmt2(disp.packChrg)}{"          "}</Text>
                      <Text style={styles.dispHeaderText}>Vat Amt :- {fmt2(disp.vatAmt)}</Text>
                    </View>
                    {/* Dispatch Header row 2 */}
                    <View style={styles.dispHeader}>
                      <Text style={styles.dispHeaderText}>LR No :- {disp.lrNo}{"          "}</Text>
                      <Text style={styles.dispHeaderText}>LR Date :- {lrDateStr}{"          "}</Text>
                      <Text style={styles.dispHeaderText}>Transport :- {disp.transport}</Text>
                    </View>
                    {/* Dispatch Header row 3 */}
                    <View style={styles.dispHeader}>
                      <Text style={styles.dispHeaderText}>Order No.  {disp.ordNo}{"          "}</Text>
                      <Text style={styles.dispHeaderText}>Total Amt.  {fmtN(disp.totalAmt)}</Text>
                    </View>

                    {/* Column Header */}
                    <View style={styles.colHeader}>
                      <Text style={[styles.colTh, { width: 30 }]}>Sr</Text>
                      <Text style={[styles.colTh, { width: 110 }]}>Item Code</Text>
                      <Text style={[styles.colTh, { flex: 1 }]}>Item Name</Text>
                      <Text style={[styles.colTh, { width: 60, textAlign: "right" }]}>Disp Qty</Text>
                      <Text style={[styles.colTh, { width: 50, textAlign: "right" }]}>Qty</Text>
                      <Text style={[styles.colTh, { width: 70, textAlign: "right" }]}>Rate</Text>
                      <Text style={[styles.colTh, { width: 60, textAlign: "right" }]}>Disc</Text>
                      <Text style={[styles.colTh, { width: 80, textAlign: "right" }]}>Amount</Text>
                    </View>

                    {/* Items */}
                    {disp.items.map((item, ii) => (
                      <View key={ii} style={[styles.itemRow, ii % 2 === 1 && styles.itemRowAlt]}>
                        <Text style={[styles.td, { width: 30 }]}>{ii + 1}</Text>
                        <Text style={[styles.td, { width: 110 }]} numberOfLines={1}>{item.itemCode}</Text>
                        <Text style={[styles.td, { flex: 1 }]} numberOfLines={2}>{item.itemName}</Text>
                        <Text style={[styles.td, { width: 60, textAlign: "right" }]}>{parseFloat(item.dispQty || 0).toFixed(0)}</Text>
                        <Text style={[styles.td, { width: 50, textAlign: "right" }]}>{item.ordQty || ""}</Text>
                        <Text style={[styles.td, { width: 70, textAlign: "right" }]}>{fmtN(item.rate)}</Text>
                        <Text style={[styles.td, { width: 60, textAlign: "right" }]}>{fmtN(item.disc)}</Text>
                        <Text style={[styles.td, { width: 80, textAlign: "right", fontWeight: "600" }]}>{fmtN(item.amount)}</Text>
                      </View>
                    ))}

                    {/* Dispatch subtotal (red/bold like report) */}
                    <View style={styles.subTotalRow}>
                      <Text style={[styles.subTotalCell, { width: 30 }]}></Text>
                      <Text style={[styles.subTotalCell, { width: 110 }]}></Text>
                      <Text style={[styles.subTotalCell, { flex: 1 }]}></Text>
                      <Text style={[styles.subTotalNum, { width: 60 }]}>{subQty.toFixed(0)}</Text>
                      <Text style={[styles.subTotalNum, { width: 50 }]}></Text>
                      <Text style={[styles.subTotalNum, { width: 70 }]}>{fmtN(subRate)}</Text>
                      <Text style={[styles.subTotalNum, { width: 60 }]}>{fmtN(subDisc)}</Text>
                      <Text style={[styles.subTotalNum, { width: 80 }]}>{fmtN(subAmt)}</Text>
                    </View>
                  </View>
                );
              })}

              {/* Party Wise Total */}
              <View style={styles.partyTotalRow}>
                <Text style={[styles.partyTotalLabel, { flex: 1 }]}>Party Wise Total</Text>
                <Text style={[styles.partyTotalNum, { width: 60 }]}>{partyTotalQty.toFixed(0)}</Text>
                <Text style={[styles.partyTotalNum, { width: 50 }]}></Text>
                <Text style={[styles.partyTotalNum, { width: 70 }]}>{fmtN(partyTotalRate)}</Text>
                <Text style={[styles.partyTotalNum, { width: 60 }]}>{fmtN(partyTotalDisc)}</Text>
                <Text style={[styles.partyTotalNum, { width: 80 }]}>{fmtN(partyTotalAmt)}</Text>
              </View>
            </View>
          );
        })}
      </View>
    </ScrollView>
  );
};

// ─── Main Screen ─────────────────────────────────────────────────────────────
export default function DispatchReportScreen({ navigation }) {
  const [loading, setLoading]               = useState(false);
  const [dropdownLoading, setDropdownLoading] = useState(false);
  const [reportData, setReportData]         = useState(null);
  const [pdfLoading, setPdfLoading]         = useState(false);

  const [allParties, setAllParties]         = useState([]);
  const [allDispatchNos, setAllDispatchNos] = useState([]);
  const [allProducts, setAllProducts]       = useState([]);

  const today = new Date();
  const [fromDate, setFromDate]             = useState(today);
  const [toDate, setToDate]                 = useState(today);
  const [showFromPicker, setShowFromPicker] = useState(false);
  const [showToPicker, setShowToPicker]     = useState(false);

  const [selParties, setSelParties]         = useState([]);
  const [selDispatchNos, setSelDispatchNos] = useState([]);
  const [selProducts, setSelProducts]       = useState([]);

  const [showPartyModal, setShowPartyModal]     = useState(false);
  const [showDispatchModal, setShowDispatchModal] = useState(false);
  const [showProductModal, setShowProductModal] = useState(false);

  useEffect(() => {
    (async () => {
      setDropdownLoading(true);
      try {
        const [pData, dData, prodData] = await Promise.all([
          fetchDispatchParties(),
          fetchDispatchNumbers(),
          fetchDispatchProducts(),
        ]);
        setAllParties(pData.data || []);
        setAllDispatchNos(dData.data || []);
        setAllProducts(prodData.data || []);
      } catch (e) {
        Alert.alert("Error", "Could not load filter options.\n" + (e?.response?.data?.message || e.message));
      } finally {
        setDropdownLoading(false);
      }
    })();
  }, []);

  const handleReset = () => {
    setSelParties([]); setSelDispatchNos([]); setSelProducts([]);
    setReportData(null);
  };

  const handleGenerateReport = async () => {
    setLoading(true);
    setReportData(null);
    try {
      const filters = {
        fromDate:    toApiDate(fromDate),
        toDate:      toApiDate(toDate),
        // Party: send ac_code (first selected)
        partyIds:    selParties.length    > 0 ? selParties.map(p => p.PartyID).join(",")      : "All",
        // Dispatch: send Ord_no string (VouchNo param) — not the numeric trans_no
        dispatchNos: selDispatchNos.length > 0 ? selDispatchNos.map(d => d.Vouchno).join(",") : "All",
        // Product: send prod_code
        productIds:  selProducts.length   > 0 ? selProducts.map(p => p.ItemCode).join(",")    : "All",
      };
      const res = await fetchDispatchReport(filters);
      if (res.success && res.data?.length > 0) {
        setReportData(res.data);
      } else {
        Alert.alert("No Data", res.message || "No dispatch records found for the selected filters.");
      }
    } catch (e) {
      Alert.alert("Error", e?.response?.data?.message || e.message || "Failed to generate dispatch report.");
    } finally {
      setLoading(false);
    }
  };

  const handleDownloadPdf = async () => {
    if (!reportData) return;
    setPdfLoading(true);
    try {
      const partyLabel = selParties.length > 0 ? selParties.map(p => p.PartyName).join(", ") : null;
      const html = buildDispatchPdfHtml(reportData, {
        fromDate: toDisplay(fromDate),
        toDate:   toDisplay(toDate),
        partyLabel,
      });
      const { uri } = await Print.printToFileAsync({ html, base64: false });
      const safeParty = (partyLabel || 'AllParties').replace(/[^a-zA-Z0-9]/g, '_');
      const today = toDisplay(new Date()).replace(/\//g, '-');
      const fileName = `Dispatch_${safeParty}_${today}.pdf`;
      const destUri = `${FileSystem.cacheDirectory}${fileName}`;
      await FileSystem.copyAsync({ from: uri, to: destUri });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(destUri, { mimeType: "application/pdf", dialogTitle: "Dispatch Report", UTI: "com.adobe.pdf" });
      } else {
        Alert.alert("PDF Saved", `Saved as: ${fileName}`);
      }
    } catch (e) { Alert.alert("Error", "Failed to generate PDF: " + e.message); }
    finally { setPdfLoading(false); }
  };


  const dispLabel = (d) => d.Vouchno ? `${d.Vouchno}  (${d.Trans_No})` : String(d.Trans_No);

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar backgroundColor="#0056b3" barStyle="light-content" />

      <View style={styles.header}>
        <TouchableOpacity style={styles.headerBack} onPress={() => navigation.goBack()}>
          <Icon name="back" size={22} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Dispatch Report</Text>
        <TouchableOpacity onPress={handleReset} style={{ padding: 4 }}>
          <Text style={{ color: "#fff", fontSize: 13, fontWeight: "700" }}>RESET</Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>

        {dropdownLoading && (
          <View style={styles.loadingBar}>
            <ActivityIndicator size="small" color="#0056b3" />
            <Text style={styles.loadingText}>Loading filter options…</Text>
          </View>
        )}

        <View style={styles.card}>
          {/* Dates */}
          <View style={styles.row}>
            <View style={styles.halfCol}>
              <FieldLabel label="FROM DATE" />
              <TouchableOpacity style={styles.dateBtn} onPress={() => { setShowFromPicker(true); setReportData(null); }}>
                <Icon name="calendar" size={15} color="#0056b3" />
                <Text style={styles.dateBtnText}>{toDisplay(fromDate)}</Text>
              </TouchableOpacity>
              {showFromPicker && (
                <DateTimePicker value={fromDate} mode="date" display={Platform.OS === "ios" ? "inline" : "calendar"}
                  onChange={(_, d) => { setShowFromPicker(Platform.OS === "ios"); if (d) setFromDate(d); }}
                  maximumDate={toDate} />
              )}
            </View>
            <View style={styles.halfCol}>
              <FieldLabel label="TO DATE" />
              <TouchableOpacity style={styles.dateBtn} onPress={() => { setShowToPicker(true); setReportData(null); }}>
                <Icon name="calendar" size={15} color="#0056b3" />
                <Text style={styles.dateBtnText}>{toDisplay(toDate)}</Text>
              </TouchableOpacity>
              {showToPicker && (
                <DateTimePicker value={toDate} mode="date" display={Platform.OS === "ios" ? "inline" : "calendar"}
                  onChange={(_, d) => { setShowToPicker(Platform.OS === "ios"); if (d) setToDate(d); }}
                  minimumDate={fromDate} />
              )}
            </View>
          </View>

          {/* Party */}
          <View style={styles.fieldBlock}>
            <FieldLabel label={`PARTY${selParties.length > 0 ? ` (${selParties.length} selected)` : ""}`} />
            <MultiBtn selected={selParties} renderLabel={(p) => p.PartyName} onPress={() => setShowPartyModal(true)} />
          </View>

          {/* Dispatch No */}
          <View style={styles.fieldBlock}>
            <FieldLabel label={`DISPATCH NO.${selDispatchNos.length > 0 ? ` (${selDispatchNos.length} selected)` : ""}`} />
            <MultiBtn selected={selDispatchNos} renderLabel={dispLabel} onPress={() => setShowDispatchModal(true)} />
          </View>

          {/* Product */}
          <View style={styles.fieldBlock}>
            <FieldLabel label={`PRODUCT${selProducts.length > 0 ? ` (${selProducts.length} selected)` : ""}`} />
            <MultiBtn selected={selProducts} renderLabel={(p) => p.ProductName} onPress={() => setShowProductModal(true)} />
          </View>

          <TouchableOpacity style={[styles.generateBtn, loading && { opacity: 0.7 }]} onPress={handleGenerateReport} disabled={loading}>
            {loading
              ? <ActivityIndicator color="#fff" size="small" />
              : <Text style={styles.generateBtnText}>📊  Generate Report</Text>
            }
          </TouchableOpacity>
        </View>

        {/* Crystal Report output */}
        {reportData && (
          <View style={[styles.card, { padding: 0, overflow: "hidden" }]}>
            <View style={[styles.reportTitleBar, { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 14 }]}>
              <Text style={styles.reportTitleText}>Dispatch Report</Text>
              <TouchableOpacity
                style={[styles.pdfBtn, pdfLoading && { opacity: 0.6 }]}
                onPress={handleDownloadPdf}
                disabled={pdfLoading}
              >
                {pdfLoading
                  ? <ActivityIndicator size="small" color="#fff" />
                  : <Text style={styles.pdfBtnText}>📄 PDF</Text>
                }
              </TouchableOpacity>
            </View>
            <ReportView data={reportData} />
          </View>
        )}

      </ScrollView>

      {/* Modals */}
      <MultiSelectDropdown visible={showPartyModal} data={allParties} selected={selParties} idKey="PartyID"
        title="Select Party" placeholder="Search party…" renderLabel={(p) => p.PartyName}
        onDone={setSelParties} onClose={() => setShowPartyModal(false)} />

      <MultiSelectDropdown visible={showDispatchModal} data={allDispatchNos} selected={selDispatchNos} idKey="Trans_No"
        title="Select Dispatch No." placeholder="Search dispatch…" renderLabel={dispLabel}
        onDone={setSelDispatchNos} onClose={() => setShowDispatchModal(false)} />

      <MultiSelectDropdown visible={showProductModal} data={allProducts} selected={selProducts} idKey="ItemCode"
        title="Select Product" placeholder="Search product…" renderLabel={(p) => p.ProductName}
        onDone={setSelProducts} onClose={() => setShowProductModal(false)} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#f0f4f8" },
  header: { backgroundColor: "#0056b3", flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 14 },
  headerBack: { marginRight: 12 },
  headerTitle: { flex: 1, color: "#fff", fontSize: 18, fontWeight: "700" },
  scroll: { flex: 1 },
  scrollContent: { padding: 16, paddingBottom: 40 },
  card: { backgroundColor: "#fff", borderRadius: 12, padding: 16, marginBottom: 16, elevation: 2, shadowColor: "#000", shadowOpacity: 0.07, shadowRadius: 6, shadowOffset: { width: 0, height: 2 } },
  loadingBar: { flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: "#e8f0fe", borderRadius: 8, padding: 10, marginBottom: 8 },
  loadingText: { fontSize: 13, color: "#0056b3" },
  row: { flexDirection: "row", gap: 10, marginBottom: 14 },
  halfCol: { flex: 1 },
  fieldBlock: { marginBottom: 14 },
  fieldLabel: { fontSize: 11, fontWeight: "700", color: "#64748b", letterSpacing: 0.8, marginBottom: 6 },
  dateBtn: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "#f1f5f9", borderRadius: 8, padding: 10, borderWidth: 1, borderColor: "#cbd5e1" },
  dateBtnText: { fontSize: 14, color: "#1e293b", fontWeight: "500" },
  selectBtn: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", backgroundColor: "#f1f5f9", borderRadius: 8, paddingHorizontal: 12, paddingVertical: 12, borderWidth: 1, borderColor: "#cbd5e1" },
  selectBtnText: { flex: 1, fontSize: 14, color: "#94a3b8" },
  selectBtnActive: { color: "#1e293b", fontWeight: "600" },
  generateBtn: { backgroundColor: "#0056b3", borderRadius: 10, paddingVertical: 14, alignItems: "center", marginTop: 4 },
  generateBtnText: { color: "#fff", fontSize: 15, fontWeight: "700" },

  // Modal
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" },
  modalContent: { backgroundColor: "#fff", borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: "88%", paddingBottom: 20 },
  modalHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", padding: 16, borderBottomWidth: 1, borderBottomColor: "#f1f5f9" },
  modalTitle: { fontSize: 16, fontWeight: "700", color: "#0f172a" },
  closeText: { color: "#0056b3", fontWeight: "700", fontSize: 14 },
  actionRow: { flexDirection: "row", gap: 8, padding: 12, borderBottomWidth: 1, borderBottomColor: "#f1f5f9" },
  actionBtn: { backgroundColor: "#e8f0fe", borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, alignItems: "center" },
  actionBtnText: { color: "#0056b3", fontWeight: "700", fontSize: 13 },
  searchBar: { flexDirection: "row", alignItems: "center", gap: 8, margin: 12, backgroundColor: "#f8fafc", borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, borderWidth: 1, borderColor: "#e2e8f0" },
  searchInput: { flex: 1, fontSize: 14, color: "#1e293b", paddingVertical: 0 },
  listItem: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 13, borderBottomWidth: 1, borderBottomColor: "#f8fafc", gap: 12 },
  listItemText: { flex: 1, fontSize: 14, color: "#1e293b" },
  checkbox: { width: 22, height: 22, borderRadius: 5, borderWidth: 2, borderColor: "#cbd5e1", alignItems: "center", justifyContent: "center" },
  checkboxSel: { backgroundColor: "#0056b3", borderColor: "#0056b3" },

  // Crystal Report styles
  reportTitleBar: { backgroundColor: "#0056b3", padding: 10 },
  reportTitleText: { color: "#fff", fontSize: 14, fontWeight: "700", textAlign: "center" },
  partyBlock: { marginBottom: 8 },
  partyHeader: { backgroundColor: "#1565C0", paddingVertical: 7, paddingHorizontal: 10 },
  partyHeaderText: { color: "#fff", fontSize: 13, fontWeight: "700" },
  dispHeader: { backgroundColor: "#FFF9C4", flexDirection: "row", flexWrap: "wrap", paddingHorizontal: 10, paddingVertical: 4, borderBottomWidth: 1, borderBottomColor: "#f0e000" },
  dispHeaderText: { fontSize: 11, color: "#1a1a00", fontWeight: "600" },
  colHeader: { flexDirection: "row", backgroundColor: "#e8f0fe", paddingVertical: 6, paddingHorizontal: 6, borderBottomWidth: 1, borderBottomColor: "#bcd0f5" },
  colTh: { fontSize: 11, fontWeight: "700", color: "#0056b3" },
  itemRow: { flexDirection: "row", paddingVertical: 5, paddingHorizontal: 6, borderBottomWidth: 1, borderBottomColor: "#f1f5f9" },
  itemRowAlt: { backgroundColor: "#f9fafe" },
  td: { fontSize: 11, color: "#334155" },
  subTotalRow: { flexDirection: "row", paddingVertical: 5, paddingHorizontal: 6, backgroundColor: "#FFF9C4", borderTopWidth: 1, borderTopColor: "#e0cc00" },
  subTotalCell: { fontSize: 11 },
  subTotalNum: { fontSize: 11, color: "#cc0000", fontWeight: "700", textAlign: "right" },
  partyTotalRow: { flexDirection: "row", alignItems: "center", backgroundColor: "#e8f0fe", paddingVertical: 8, paddingHorizontal: 6, borderTopWidth: 2, borderTopColor: "#0056b3", marginTop: 2 },
  partyTotalLabel: { fontSize: 12, fontWeight: "700", color: "#0056b3", flex: 1 },
  partyTotalNum: { fontSize: 12, fontWeight: "800", color: "#0056b3", textAlign: "right" },
  pdfBtn: { backgroundColor: "rgba(255,255,255,0.2)", borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6, borderWidth: 1, borderColor: "rgba(255,255,255,0.5)" },
  pdfBtnText: { color: "#fff", fontWeight: "700", fontSize: 13 },
});
