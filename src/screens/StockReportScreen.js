import React, { useState, useEffect, useCallback } from "react";
import {
  View, Text, TextInput, TouchableOpacity, ScrollView,
  StyleSheet, SafeAreaView, StatusBar, Alert, ActivityIndicator,
  Modal, FlatList, Platform,
} from "react-native";
import DateTimePicker from "@react-native-community/datetimepicker";
import { fetchParties, fetchProducts, fetchStockReport } from "../services/api";
import Icon from "../components/Icon";

// ── Date helpers ──────────────────────────────────────────────────────────────
const toApiDate  = (d) => d.toISOString().split('T')[0];
const toDisplay  = (d) => {
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${dd}/${mm}/${d.getFullYear()}`;
};

const FieldLabel = ({ label }) => <Text style={styles.fieldLabel}>{label}</Text>;

// ── Inline searchable multi-select list (used inside modals) ──────────────────
const MultiSearchList = ({ data, selected, onToggle, labelKey }) => {
  const [search, setSearch] = useState("");
  const filtered = data.filter(item =>
    (item[labelKey] || item.ItemCode || "").toLowerCase().includes(search.toLowerCase())
  );
  return (
    <>
      <View style={styles.searchBar}>
        <Icon name="search" size={14} color="#90a4ae" />
        <TextInput
          style={styles.searchInput}
          placeholder="Search..."
          value={search}
          onChangeText={setSearch}
        />
      </View>
      <FlatList
        data={filtered}
        keyExtractor={(item, i) => item.PartyID || item.ItemCode || String(i)}
        renderItem={({ item }) => {
          const id = item.PartyID || item.ItemCode;
          const label = item[labelKey] || item.ItemCode;
          const isChecked = selected.some(s => (s.PartyID || s.ItemCode) === id);
          return (
            <TouchableOpacity
              style={[styles.listItem, { flexDirection: 'row', alignItems: 'center' }]}
              onPress={() => onToggle(item)}
            >
              <View style={[styles.cbBox, isChecked && styles.cbBoxChecked]}>
                {isChecked && <Text style={styles.cbTick}>✓</Text>}
              </View>
              <Text style={styles.listItemText}>{label}</Text>
            </TouchableOpacity>
          );
        }}
      />
    </>
  );
};

// ── Main Screen ───────────────────────────────────────────────────────────────
export default function StockReportScreen({ navigation }) {
  const [loading, setLoading] = useState(false);
  const [dropdownLoading, setDropdownLoading] = useState(false);
  const [reportData, setReportData] = useState(null);

  const [allParties, setAllParties]   = useState([]);
  const [allProducts, setAllProducts] = useState([]);
  const [parties, setParties]         = useState([]);
  const [products, setProducts]       = useState([]);

  // Dates
  const today = new Date();
  const [fromDate, setFromDate]           = useState(today);
  const [toDate, setToDate]               = useState(today);
  const [showFromPicker, setShowFromPicker] = useState(false);
  const [showToPicker, setShowToPicker]     = useState(false);

  // Multi-select selections
  const [selectedParties,  setSelectedParties]  = useState([]);
  const [selectedProducts, setSelectedProducts] = useState([]);
  const [isSummary, setIsSummary]               = useState(true); // summary ON by default

  // Temp state for modals
  const [tempParties,  setTempParties]  = useState([]);
  const [tempProducts, setTempProducts] = useState([]);

  // Modal visibility
  const [showPartyModal,   setShowPartyModal]   = useState(false);
  const [showProductModal, setShowProductModal] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const [pData, prodData] = await Promise.all([fetchParties(), fetchProducts()]);
        const p    = pData.data    || [];
        const prod = prodData.data || [];
        setAllParties(p);    setParties(p);
        setAllProducts(prod); setProducts(prod);
      } catch (e) { console.error("Failed to load stock dropdowns", e); }
    })();
  }, []);

  // ── Party toggle & confirm ──────────────────────────────────────────────────
  const toggleParty = useCallback((party) => {
    setTempParties(prev => {
      const exists = prev.some(p => p.PartyID === party.PartyID);
      return exists ? prev.filter(p => p.PartyID !== party.PartyID) : [...prev, party];
    });
  }, []);

  const confirmPartySelection = useCallback(async () => {
    setSelectedParties(tempParties);
    setSelectedProducts([]); setReportData(null);
    setShowPartyModal(false);
    if (tempParties.length === 0) { setProducts(allProducts); return; }
    setDropdownLoading(true);
    try {
      const partyParam = tempParties.map(p => p.PartyID).join(',');
      const prodData = await fetchProducts({ partyId: partyParam });
      setProducts(prodData.data || []);
    } catch (e) { console.error(e); } finally { setDropdownLoading(false); }
  }, [tempParties, allProducts]);

  // ── Product toggle & confirm ────────────────────────────────────────────────
  const toggleProduct = useCallback((product) => {
    setTempProducts(prev => {
      const exists = prev.some(p => p.ItemCode === product.ItemCode);
      return exists ? prev.filter(p => p.ItemCode !== product.ItemCode) : [...prev, product];
    });
  }, []);

  const confirmProductSelection = useCallback(async () => {
    setSelectedProducts(tempProducts);
    setReportData(null);
    setShowProductModal(false);
    if (tempProducts.length === 0) { setParties(allParties); return; }
    setDropdownLoading(true);
    try {
      const productParam = tempProducts.map(p => p.ItemCode).join(',');
      const pData = await fetchParties({ productId: productParam });
      setParties(pData.data || []);
    } catch (e) { console.error(e); } finally { setDropdownLoading(false); }
  }, [tempProducts, allParties]);

  // ── Reset ───────────────────────────────────────────────────────────────────
  const handleReset = () => {
    setSelectedParties([]); setSelectedProducts([]);
    setTempParties([]); setTempProducts([]);
    setFromDate(new Date()); setToDate(new Date());
    setIsSummary(true); setReportData(null);
    setParties(allParties); setProducts(allProducts);
  };

  // ── Generate Report ─────────────────────────────────────────────────────────
  const handleGenerateReport = async () => {
    setLoading(true); setReportData(null);
    try {
      const partyParam   = selectedParties.length  > 0 ? selectedParties.map(p => p.PartyID).join(',')   : 'All';
      const productParam = selectedProducts.length > 0 ? selectedProducts.map(p => p.ItemCode).join(',') : 'All';
      const res = await fetchStockReport({
        fromDate:  toApiDate(fromDate),
        toDate:    toApiDate(toDate),
        partyId:   partyParam,
        productId: productParam,
        summary:   isSummary,
      });
      if (res.success && res.data?.length > 0) {
        setReportData(res.data);
      } else {
        Alert.alert("No Data", "No records found for the selected filters.");
      }
    } catch (e) { Alert.alert("Error", "Failed to generate stock report."); }
    finally { setLoading(false); }
  };

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
        {/* Filters Card */}
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Filters</Text>

          {dropdownLoading && (
            <View style={styles.cascadeBar}>
              <ActivityIndicator size="small" color="#0056b3" />
              <Text style={styles.cascadeText}>Updating filters…</Text>
            </View>
          )}

          {/* Date pickers */}
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

          {/* Party multi-select */}
          <FieldLabel label="PARTY NAME" />
          <TouchableOpacity style={styles.dropdown} onPress={() => { setTempParties(selectedParties); setShowPartyModal(true); }}>
            <Text style={selectedParties.length > 0 ? styles.dropdownValue : styles.dropdownPlaceholder}>
              {selectedParties.length > 0 ? `${selectedParties.length} party(s) selected` : 'All Parties'}
            </Text>
            <Icon name="chevron" size={16} color="#90a4ae" />
          </TouchableOpacity>

          {/* Product multi-select */}
          <FieldLabel label="PRODUCT" />
          <TouchableOpacity style={styles.dropdown} onPress={() => { setTempProducts(selectedProducts); setShowProductModal(true); }}>
            <Text style={selectedProducts.length > 0 ? styles.dropdownValue : styles.dropdownPlaceholder}>
              {selectedProducts.length > 0 ? `${selectedProducts.length} product(s) selected` : 'All Products'}
            </Text>
            <Icon name="chevron" size={16} color="#90a4ae" />
          </TouchableOpacity>

          {/* Summary toggle */}
          <FieldLabel label="REPORT MODE" />
          <TouchableOpacity
            style={[styles.checkboxContainer, isSummary && styles.checkboxActive]}
            onPress={() => { setIsSummary(!isSummary); setReportData(null); }}
          >
            <View style={[styles.checkbox, isSummary && styles.checkboxFilled]} />
            <Text style={[styles.checkboxLabel, isSummary && { color: '#0056b3' }]}>Summary Only</Text>
          </TouchableOpacity>

          {/* Active filter chips */}
          {(selectedParties.length > 0 || selectedProducts.length > 0) && (
            <View style={styles.chipRow}>
              {selectedParties.map(p => (
                <View key={p.PartyID} style={styles.chip}>
                  <Text style={styles.chipText}>{p.PartyName}</Text>
                </View>
              ))}
              {selectedProducts.map(p => (
                <View key={p.ItemCode} style={styles.chip}>
                  <Text style={styles.chipText}>{p.ItemCode}</Text>
                </View>
              ))}
            </View>
          )}

          <TouchableOpacity style={styles.generateBtn} onPress={handleGenerateReport} disabled={loading}>
            {loading ? <ActivityIndicator color="#fff" /> : <>
              <Icon name="reports" size={18} color="#fff" />
              <Text style={styles.generateBtnText}>GENERATE REPORT</Text>
            </>}
          </TouchableOpacity>
        </View>

        {/* Results Table */}
        {reportData && (
          <View style={styles.resultsCard}>
            <View style={styles.resultsHeader}>
              <View>
                <Text style={styles.resultsTitle}>Results</Text>
                <Text style={styles.resultsCount}>{reportData.length} product(s) found</Text>
              </View>
            </View>

            {/* Table header */}
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

            {/* Grand Total */}
            <View style={[styles.tableRow, { backgroundColor: '#e3f2fd' }]}>
              <Text style={[styles.tdBold, { flex: 3.2 }]}>TOTAL</Text>
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
            <MultiSearchList data={parties} selected={tempParties} onToggle={toggleParty} labelKey="PartyName" />
            <TouchableOpacity style={styles.doneBtn} onPress={confirmPartySelection}>
              <Text style={styles.doneBtnText}>DONE  ({tempParties.length} selected)</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Product multi-select modal */}
      <Modal visible={showProductModal} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Select Products</Text>
              <TouchableOpacity onPress={() => setShowProductModal(false)}>
                <Text style={styles.closeText}>Cancel</Text>
              </TouchableOpacity>
            </View>
            {tempProducts.length > 0 && (
              <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#e3f2fd', borderRadius: 10, padding: 10, marginBottom: 12 }}>
                <Text style={{ color: '#0056b3', fontWeight: '700', flex: 1 }}>{tempProducts.length} product(s) selected</Text>
                <TouchableOpacity onPress={() => setTempProducts([])}>
                  <Text style={{ color: '#e91e63', fontWeight: '600', fontSize: 12 }}>Clear all</Text>
                </TouchableOpacity>
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
  checkboxLabel: { fontSize: 12, color: "#78909c", fontWeight: "600" },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 14 },
  chip: { backgroundColor: '#e3f2fd', borderRadius: 20, paddingHorizontal: 12, paddingVertical: 4 },
  chipText: { color: '#0056b3', fontSize: 12, fontWeight: '600' },
  generateBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", backgroundColor: "#0056b3", borderRadius: 12, paddingVertical: 15, marginTop: 20, elevation: 4, gap: 10 },
  generateBtnText: { color: "#fff", fontWeight: "800", fontSize: 15 },
  // Results
  resultsCard: { backgroundColor: "#fff", borderRadius: 16, elevation: 3, overflow: 'hidden', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 8 },
  resultsHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderBottomColor: '#e8eaf6' },
  resultsTitle: { fontSize: 16, fontWeight: '800', color: '#0056b3' },
  resultsCount: { fontSize: 12, color: '#78909c', marginTop: 2 },
  tableHeader: { flexDirection: 'row', backgroundColor: '#0056b3', paddingVertical: 10, paddingHorizontal: 12 },
  th: { color: '#fff', fontSize: 11, fontWeight: '700', letterSpacing: 0.5 },
  tableRow: { flexDirection: 'row', paddingVertical: 10, paddingHorizontal: 12, borderBottomWidth: 1, borderBottomColor: '#f0f2f5', alignItems: 'center' },
  td: { fontSize: 12, color: '#37474f' },
  tdBold: { fontSize: 12, color: '#1a237e', fontWeight: '700' },
  tdBal: { fontSize: 12, color: '#c62828', fontWeight: '800', textAlign: 'center' },
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
