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

// ─── Date helpers ────────────────────────────────────────────────────────────
const toDisplay = (d) => d.toLocaleDateString("en-GB");   // DD/MM/YYYY
const toApiDate = (d) => d.toISOString().split("T")[0];   // YYYY-MM-DD

// ─── Multi-Select Dropdown ───────────────────────────────────────────────────
const MultiSelectDropdown = ({ visible, data, selected, onDone, onClose, title, placeholder, renderLabel, idKey }) => {
  const [search, setSearch]           = useState("");
  const [localSel, setLocalSel]       = useState([]);

  // Sync on open
  useEffect(() => { if (visible) setLocalSel(selected); }, [visible]);

  const filtered = data.filter(item =>
    renderLabel(item).toLowerCase().includes(search.toLowerCase())
  );
  const isSel = (item) => localSel.some(s => String(s[idKey]) === String(item[idKey]));

  const toggle = (item) => {
    if (isSel(item)) setLocalSel(prev => prev.filter(s => String(s[idKey]) !== String(item[idKey])));
    else             setLocalSel(prev => [...prev, item]);
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          {/* Header */}
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>{title}</Text>
            <TouchableOpacity onPress={() => { onClose(); setSearch(""); }}>
              <Text style={styles.closeText}>Cancel</Text>
            </TouchableOpacity>
          </View>

          {/* Action row: Select All / Clear / Done */}
          <View style={styles.actionRow}>
            <TouchableOpacity style={styles.actionBtn} onPress={() => setLocalSel([...data])}>
              <Text style={styles.actionBtnText}>Select All</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.actionBtn, { backgroundColor: "#fee2e2" }]} onPress={() => setLocalSel([])}>
              <Text style={[styles.actionBtnText, { color: "#dc2626" }]}>Clear</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.actionBtn, { backgroundColor: "#0056b3", flex: 1 }]}
              onPress={() => { onDone(localSel); setSearch(""); onClose(); }}
            >
              <Text style={[styles.actionBtnText, { color: "#fff" }]}>✓ Done ({localSel.length})</Text>
            </TouchableOpacity>
          </View>

          {/* Search */}
          <View style={styles.searchBar}>
            <Icon name="search" size={14} color="#90a4ae" />
            <TextInput
              style={styles.searchInput}
              placeholder={placeholder}
              value={search}
              onChangeText={setSearch}
              autoFocus
            />
          </View>

          {/* List */}
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

// ─── Trigger button that shows count / label ─────────────────────────────────
const MultiBtn = ({ selected, renderLabel, onPress }) => {
  let text = "All";
  if (selected.length === 1) text = renderLabel(selected[0]);
  else if (selected.length > 1) text = `${selected.length} selected`;

  return (
    <TouchableOpacity style={styles.selectBtn} onPress={onPress}>
      <Text style={[styles.selectBtnText, selected.length > 0 && styles.selectBtnActive]} numberOfLines={1}>
        {text}
      </Text>
      <Icon name="down" size={12} color="#64748b" />
    </TouchableOpacity>
  );
};

// ─── Main Screen ─────────────────────────────────────────────────────────────
export default function DispatchReportScreen({ navigation }) {
  const [loading, setLoading]               = useState(false);
  const [dropdownLoading, setDropdownLoading] = useState(false);
  const [reportData, setReportData]         = useState(null);

  // Pool data
  const [allParties, setAllParties]         = useState([]);
  const [allDispatchNos, setAllDispatchNos] = useState([]);
  const [allProducts, setAllProducts]       = useState([]);

  // Date
  const today = new Date();
  const [fromDate, setFromDate]             = useState(today);
  const [toDate, setToDate]                 = useState(today);
  const [showFromPicker, setShowFromPicker] = useState(false);
  const [showToPicker, setShowToPicker]     = useState(false);

  // Multi-selections (arrays)
  const [selParties, setSelParties]         = useState([]);
  const [selDispatchNos, setSelDispatchNos] = useState([]);
  const [selProducts, setSelProducts]       = useState([]);

  // Modal visibility
  const [showPartyModal, setShowPartyModal]     = useState(false);
  const [showDispatchModal, setShowDispatchModal] = useState(false);
  const [showProductModal, setShowProductModal] = useState(false);

  // ── Load dropdowns on mount ─────────────────────────────────────────────────
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
        console.error("Failed to load dispatch dropdowns", e);
        Alert.alert("Error", "Could not load filter options. Check connection.\n" + (e?.response?.data?.message || e.message));
      } finally {
        setDropdownLoading(false);
      }
    })();
  }, []);

  const handleReset = () => {
    setSelParties([]); setSelDispatchNos([]); setSelProducts([]);
    setReportData(null);
  };

  // ── Generate ────────────────────────────────────────────────────────────────
  const handleGenerateReport = async () => {
    setLoading(true);
    setReportData(null);
    try {
      const filters = {
        fromDate:    toApiDate(fromDate),
        toDate:      toApiDate(toDate),
        partyIds:    selParties.length    > 0 ? selParties.map(p => p.PartyID).join(",")    : "All",
        dispatchNos: selDispatchNos.length > 0 ? selDispatchNos.map(d => d.Trans_No).join(",") : "All",
        productIds:  selProducts.length   > 0 ? selProducts.map(p => p.ItemCode).join(",")  : "All",
      };
      const res = await fetchDispatchReport(filters);
      if (res.success && res.data?.length > 0) {
        setReportData(res.data);
      } else {
        Alert.alert("No Data", "No dispatch records found for the selected filters.");
      }
    } catch (e) {
      Alert.alert("Error", e?.response?.data?.message || e.message || "Failed to generate dispatch report.");
    } finally {
      setLoading(false);
    }
  };

  const totalQty = reportData?.reduce((sum, r) => sum + (parseFloat(r.TotalQty) || 0), 0) || 0;

  // ── Dispatch label helper ───────────────────────────────────────────────────
  const dispLabel = (d) => d.Vouchno ? `${d.Vouchno}  (${d.Trans_No})` : String(d.Trans_No);

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar backgroundColor="#0056b3" barStyle="light-content" />

      {/* Header */}
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

          {/* ── Date Row ─────────────────────────────────────────────────────── */}
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
                  display={Platform.OS === "ios" ? "inline" : "calendar"}
                  onChange={(_, d) => { setShowFromPicker(Platform.OS === "ios"); if (d) setFromDate(d); }}
                  maximumDate={toDate}
                />
              )}
            </View>
            <View style={styles.halfCol}>
              <FieldLabel label="TO DATE" />
              <TouchableOpacity style={styles.dateBtn} onPress={() => { setShowToPicker(true); setReportData(null); }}>
                <Icon name="calendar" size={15} color="#0056b3" />
                <Text style={styles.dateBtnText}>{toDisplay(toDate)}</Text>
              </TouchableOpacity>
              {showToPicker && (
                <DateTimePicker
                  value={toDate}
                  mode="date"
                  display={Platform.OS === "ios" ? "inline" : "calendar"}
                  onChange={(_, d) => { setShowToPicker(Platform.OS === "ios"); if (d) setToDate(d); }}
                  minimumDate={fromDate}
                />
              )}
            </View>
          </View>

          {/* ── Party ────────────────────────────────────────────────────────── */}
          <View style={styles.fieldBlock}>
            <FieldLabel label={`PARTY${selParties.length > 0 ? ` (${selParties.length} selected)` : ""}`} />
            <MultiBtn selected={selParties} renderLabel={(p) => p.PartyName} onPress={() => setShowPartyModal(true)} />
          </View>

          {/* ── Dispatch No. ──────────────────────────────────────────────────── */}
          <View style={styles.fieldBlock}>
            <FieldLabel label={`DISPATCH NO.${selDispatchNos.length > 0 ? ` (${selDispatchNos.length} selected)` : ""}`} />
            <MultiBtn selected={selDispatchNos} renderLabel={dispLabel} onPress={() => setShowDispatchModal(true)} />
          </View>

          {/* ── Product ──────────────────────────────────────────────────────── */}
          <View style={styles.fieldBlock}>
            <FieldLabel label={`PRODUCT${selProducts.length > 0 ? ` (${selProducts.length} selected)` : ""}`} />
            <MultiBtn selected={selProducts} renderLabel={(p) => p.ProductName} onPress={() => setShowProductModal(true)} />
          </View>

          {/* ── Generate ─────────────────────────────────────────────────────── */}
          <TouchableOpacity
            style={[styles.generateBtn, loading && { opacity: 0.7 }]}
            onPress={handleGenerateReport}
            disabled={loading}
          >
            {loading
              ? <ActivityIndicator color="#fff" size="small" />
              : <Text style={styles.generateBtnText}>📊  Generate Report</Text>
            }
          </TouchableOpacity>
        </View>

        {/* ── Results table ─────────────────────────────────────────────────── */}
        {reportData && (
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Results  ({reportData.length} dispatches)</Text>

            <View style={styles.tableHeader}>
              <Text style={[styles.th, { flex: 2.2 }]}>Date</Text>
              <Text style={[styles.th, { flex: 3 }]}>Dispatch No.</Text>
              <Text style={[styles.th, { flex: 2.5 }]}>Party</Text>
              <Text style={[styles.th, { flex: 1, textAlign: "right" }]}>Qty</Text>
            </View>

            {reportData.map((row, i) => (
              <View key={i} style={[styles.tableRow, i % 2 === 0 && styles.tableRowAlt]}>
                <Text style={[styles.td, { flex: 2.2 }]}>{row.DispatchDate || "—"}</Text>
                <Text style={[styles.td, { flex: 3 }]} numberOfLines={2}>{row.DispatchNo || row.DispatchID}</Text>
                <Text style={[styles.td, { flex: 2.5 }]} numberOfLines={1}>{row.PartyName || "—"}</Text>
                <Text style={[styles.td, { flex: 1, textAlign: "right", fontWeight: "700", color: "#0056b3" }]}>
                  {parseFloat(row.TotalQty || 0).toFixed(0)}
                </Text>
              </View>
            ))}

            {/* Total */}
            <View style={styles.totalRow}>
              <Text style={[styles.totalLabel, { flex: 7.7 }]}>Grand Total</Text>
              <Text style={[styles.totalValue, { flex: 1 }]}>{totalQty.toFixed(0)}</Text>
            </View>
          </View>
        )}

      </ScrollView>

      {/* ── Multi-select modals ──────────────────────────────────────────────── */}
      <MultiSelectDropdown
        visible={showPartyModal}
        data={allParties}
        selected={selParties}
        idKey="PartyID"
        title="Select Party"
        placeholder="Search party…"
        renderLabel={(p) => p.PartyName}
        onDone={setSelParties}
        onClose={() => setShowPartyModal(false)}
      />

      <MultiSelectDropdown
        visible={showDispatchModal}
        data={allDispatchNos}
        selected={selDispatchNos}
        idKey="Trans_No"
        title="Select Dispatch No."
        placeholder="Search dispatch…"
        renderLabel={dispLabel}
        onDone={setSelDispatchNos}
        onClose={() => setShowDispatchModal(false)}
      />

      <MultiSelectDropdown
        visible={showProductModal}
        data={allProducts}
        selected={selProducts}
        idKey="ItemCode"
        title="Select Product"
        placeholder="Search product…"
        renderLabel={(p) => p.ProductName}
        onDone={setSelProducts}
        onClose={() => setShowProductModal(false)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#f0f4f8" },

  // Header
  header: { backgroundColor: "#0056b3", flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 14 },
  headerBack: { marginRight: 12 },
  headerTitle: { flex: 1, color: "#fff", fontSize: 18, fontWeight: "700" },

  scroll: { flex: 1 },
  scrollContent: { padding: 16, paddingBottom: 40 },

  card: { backgroundColor: "#fff", borderRadius: 12, padding: 16, marginBottom: 16, elevation: 2, shadowColor: "#000", shadowOpacity: 0.07, shadowRadius: 6, shadowOffset: { width: 0, height: 2 } },
  sectionTitle: { fontSize: 15, fontWeight: "700", color: "#0056b3", marginBottom: 12 },

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
  actionBtn: { backgroundColor: "#e8f0fe", borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, alignItems: "center", justifyContent: "center" },
  actionBtnText: { color: "#0056b3", fontWeight: "700", fontSize: 13 },

  searchBar: { flexDirection: "row", alignItems: "center", gap: 8, margin: 12, backgroundColor: "#f8fafc", borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, borderWidth: 1, borderColor: "#e2e8f0" },
  searchInput: { flex: 1, fontSize: 14, color: "#1e293b", paddingVertical: 0 },

  listItem: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 13, borderBottomWidth: 1, borderBottomColor: "#f8fafc", gap: 12 },
  listItemText: { flex: 1, fontSize: 14, color: "#1e293b" },
  checkbox: { width: 22, height: 22, borderRadius: 5, borderWidth: 2, borderColor: "#cbd5e1", alignItems: "center", justifyContent: "center" },
  checkboxSel: { backgroundColor: "#0056b3", borderColor: "#0056b3" },

  // Results table
  tableHeader: { flexDirection: "row", backgroundColor: "#e8f0fe", borderRadius: 6, padding: 8, marginBottom: 4 },
  th: { fontSize: 11, fontWeight: "700", color: "#0056b3", letterSpacing: 0.5 },
  tableRow: { flexDirection: "row", paddingVertical: 9, paddingHorizontal: 4, borderBottomWidth: 1, borderBottomColor: "#f1f5f9" },
  tableRowAlt: { backgroundColor: "#fafcff" },
  td: { fontSize: 12, color: "#334155" },
  totalRow: { flexDirection: "row", paddingVertical: 10, paddingHorizontal: 4, borderTopWidth: 2, borderTopColor: "#0056b3", marginTop: 4 },
  totalLabel: { fontSize: 13, fontWeight: "700", color: "#0056b3" },
  totalValue: { fontSize: 13, fontWeight: "800", color: "#0056b3", textAlign: "right" },
});
