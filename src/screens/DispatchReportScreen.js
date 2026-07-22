import React, { useState, useEffect } from "react";
import {
  View, Text, TextInput, TouchableOpacity, ScrollView,
  StyleSheet, SafeAreaView, StatusBar, Alert, ActivityIndicator,
  Modal, FlatList, Platform,
} from "react-native";
import DateTimePicker from "@react-native-community/datetimepicker";
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

// ─── Group flat SP rows → parties → dispatches → items ──────────────────────
function groupRows(rows) {
  const partyMap = new Map();

  rows.forEach(row => {
    // Flexible column reading
    const partyCode = g(row, "Acc_Code", "ac_code", "Party_Code") || "";
    const partyName = g(row, "Ac_Name", "ac_name", "PartyName", "Party_Name") || "Unknown Party";

    // Dispatch grouping key (use challan trans_no or dispatch sequential no)
    const dispKey   = String(g(row, "trans_no", "Trans_No", "Cha_No", "DispatchID") || "");
    const dispNo    = g(row, "Dispatch_No", "Cha_No", "DispatchNo", "Sr_No") || "";
    const dispDate  = g(row, "Cha_dt", "Dispatch_Dt", "Date", "DispatchDate") || "";
    const packChrg  = g(row, "Pack_Chrg", "Packing_Charge", "PackCharge", "packing") || 0;
    const vatAmt    = g(row, "Vat_Amt", "VatAmt", "VAT") || 0;
    const lrNo      = g(row, "LR_No", "Lr_No", "LRNo") || "-";
    const lrDate    = g(row, "LR_Dt", "Lr_Dt", "LRDate") || "";
    const transport = g(row, "Transport", "transport") || "-";
    const ordNo     = g(row, "Ord_no", "Ord_No", "OrderNo", "VouchNo") || "";
    const totalAmt  = g(row, "Total_Amt", "TotalAmt", "total_amt") || 0;

    // Item fields
    const sr       = g(row, "SrNo", "Sr", "sr_no", "srno") || "";
    const itemCode = g(row, "Pr_code", "pr_code", "ItemCode", "Item_Code", "Prod_Code") || "";
    const itemName = g(row, "Prod_name", "prod_name", "ItemName", "Item_Name", "product_name") || "";
    const dispQty  = g(row, "Qty", "Disp_Qty", "DispQty", "qty") || 0;
    const ordQty   = g(row, "Ord_Qty", "Order_Qty", "OrdQty") || "";
    const rate     = g(row, "Rate", "rate") || 0;
    const disc     = g(row, "Disc", "Discount", "discount") || 0;
    const amount   = g(row, "Amount", "amount", "Net_Amt", "net_amt") || 0;

    // Build party
    if (!partyMap.has(partyCode + partyName)) {
      partyMap.set(partyCode + partyName, { partyCode, partyName, dispatchMap: new Map() });
    }
    const party = partyMap.get(partyCode + partyName);

    // Build dispatch
    if (!party.dispatchMap.has(dispKey)) {
      party.dispatchMap.set(dispKey, {
        dispKey, dispNo, dispDate, packChrg, vatAmt,
        lrNo, lrDate, transport, ordNo, totalAmt, items: []
      });
    }
    const dispatch = party.dispatchMap.get(dispKey);

    // Add item (only if it has meaningful data)
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
          // Party totals
          const partyTotalQty = party.dispatches.reduce((s, d) => s + d.items.reduce((si, it) => si + parseFloat(it.dispQty || 0), 0), 0);
          const partyTotalAmt = party.dispatches.reduce((s, d) => s + parseFloat(d.totalAmt || 0), 0);
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
        // DEBUG: show actual SP column names so we can fix mappings
        Alert.alert(
          "SP Columns (DEBUG)",
          "Columns:\n" + (res.columns || []).join(", ") +
          "\n\nSample row keys:\n" + Object.keys(res.sampleRow || {}).join(", ")
        );
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
            <View style={styles.reportTitleBar}>
              <Text style={styles.reportTitleText}>Dispatch Report</Text>
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
});
