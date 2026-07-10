import React, { useState, useEffect, useCallback } from "react";
import {
  View, Text, TextInput, TouchableOpacity, ScrollView,
  StyleSheet, SafeAreaView, StatusBar, Alert, ActivityIndicator,
  Modal, FlatList, Platform,
} from "react-native";
import DateTimePicker from "@react-native-community/datetimepicker";
import { fetchDispatchParties, fetchDispatchNumbers, fetchDispatchProducts, fetchDispatchReport } from "../services/api";
import Icon from "../components/Icon";

const FieldLabel = ({ label }) => <Text style={styles.fieldLabel}>{label}</Text>;

// ─── Date helpers ─────────────────────────────────────────────────────────────
const toDisplay = (d) => d.toLocaleDateString('en-GB'); // DD/MM/YYYY
const toApiDate = (d) => d.toISOString().split('T')[0];   // YYYY-MM-DD

// ─── Searchable dropdown modal ────────────────────────────────────────────────
const SearchableDropdown = ({ visible, data, onSelect, onClose, title, placeholder, renderLabel }) => {
  const [search, setSearch] = useState('');
  const filtered = data.filter(item => {
    const label = renderLabel(item);
    return label.toLowerCase().includes(search.toLowerCase());
  });

  return (
    <Modal visible={visible} animationType="slide" transparent={true} onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>{title}</Text>
            <TouchableOpacity onPress={() => { onClose(); setSearch(''); }}>
              <Text style={styles.closeText}>Cancel</Text>
            </TouchableOpacity>
          </View>
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
          <FlatList
            data={filtered}
            keyExtractor={(_, i) => i.toString()}
            renderItem={({ item }) => (
              <TouchableOpacity style={styles.listItem} onPress={() => { onSelect(item); setSearch(''); }}>
                <Text style={styles.listItemText}>{renderLabel(item)}</Text>
              </TouchableOpacity>
            )}
          />
        </View>
      </View>
    </Modal>
  );
};

// ─── Main Screen ──────────────────────────────────────────────────────────────
export default function DispatchReportScreen({ navigation }) {
  const [loading, setLoading]               = useState(false);
  const [dropdownLoading, setDropdownLoading] = useState(false);
  const [reportData, setReportData]         = useState(null);

  // Data pools
  const [allParties, setAllParties]         = useState([]);
  const [allDispatchNos, setAllDispatchNos] = useState([]);  // [{Trans_No, Vouchno}]
  const [allProducts, setAllProducts]       = useState([]);

  const [parties, setParties]               = useState([]);
  const [dispatchNos, setDispatchNos]       = useState([]);
  const [products, setProducts]             = useState([]);

  // Date state (Date objects like StockReportScreen)
  const today = new Date();
  const [fromDate, setFromDate]             = useState(today);
  const [toDate, setToDate]                 = useState(today);
  const [showFromPicker, setShowFromPicker] = useState(false);
  const [showToPicker, setShowToPicker]     = useState(false);

  // Selections
  const [selectedParty, setSelectedParty]         = useState(null);
  const [selectedDispatchNo, setSelectedDispatchNo] = useState(null); // {Trans_No, Vouchno}
  const [selectedProduct, setSelectedProduct]     = useState(null);

  const [showPartyModal, setShowPartyModal]       = useState(false);
  const [showDispatchModal, setShowDispatchModal] = useState(false);
  const [showProductModal, setShowProductModal]   = useState(false);

  // ── Load initial dropdowns ──────────────────────────────────────────────────
  useEffect(() => {
    (async () => {
      setDropdownLoading(true);
      try {
        const [pData, dData, prodData] = await Promise.all([
          fetchDispatchParties(),
          fetchDispatchNumbers(),
          fetchDispatchProducts(),
        ]);
        const p    = pData.data    || [];
        const d    = dData.data    || [];     // [{Trans_No, Vouchno}]
        const prod = prodData.data || [];
        setAllParties(p);     setParties(p);
        setAllDispatchNos(d); setDispatchNos(d);
        setAllProducts(prod); setProducts(prod);
      } catch (e) {
        console.error('Failed to load dispatch dropdowns', e);
        Alert.alert('Error', 'Could not load filter options. Check connection.');
      } finally {
        setDropdownLoading(false);
      }
    })();
  }, []);

  // ── Cascade: Party → dispatch numbers + products ────────────────────────────
  const handlePartySelect = useCallback(async (party) => {
    const isAll = !party;
    setSelectedParty(isAll ? null : party);
    setSelectedDispatchNo(null);
    setSelectedProduct(null);
    setShowPartyModal(false);
    if (isAll) {
      setDispatchNos(allDispatchNos);
      setProducts(allProducts);
      return;
    }
    setDropdownLoading(true);
    try {
      const [dData, prodData] = await Promise.all([
        fetchDispatchNumbers({ partyId: party.PartyID }),
        fetchDispatchProducts({ partyId: party.PartyID }),
      ]);
      setDispatchNos(dData.data || []);
      setProducts(prodData.data || []);
    } catch (e) { console.error('Cascade party error', e); }
    finally { setDropdownLoading(false); }
  }, [allDispatchNos, allProducts]);

  // ── Cascade: Dispatch No → products ────────────────────────────────────────
  const handleDispatchSelect = useCallback(async (dispObj) => {
    const isAll = !dispObj;
    setSelectedDispatchNo(isAll ? null : dispObj);
    setSelectedProduct(null);
    setShowDispatchModal(false);
    setDropdownLoading(true);
    try {
      const params = {};
      if (!isAll) params.dispatchNo = dispObj.Trans_No;
      if (selectedParty?.PartyID) params.partyId = selectedParty.PartyID;
      const prodData = await fetchDispatchProducts(Object.keys(params).length ? params : {});
      setProducts(prodData.data || []);
    } catch (e) { console.error('Cascade dispatch error', e); }
    finally { setDropdownLoading(false); }
  }, [selectedParty]);

  // ── Cascade: Product → dispatch numbers ────────────────────────────────────
  const handleProductSelect = useCallback(async (product) => {
    const isAll = !product;
    setSelectedProduct(isAll ? null : product);
    setSelectedDispatchNo(null);
    setShowProductModal(false);
    setDropdownLoading(true);
    try {
      const params = {};
      if (!isAll) params.productId = product.ItemCode;
      if (selectedParty?.PartyID) params.partyId = selectedParty.PartyID;
      const dData = await fetchDispatchNumbers(Object.keys(params).length ? params : {});
      setDispatchNos(dData.data || []);
    } catch (e) { console.error('Cascade product error', e); }
    finally { setDropdownLoading(false); }
  }, [selectedParty]);

  const handleReset = () => {
    setSelectedParty(null);
    setSelectedDispatchNo(null);
    setSelectedProduct(null);
    setParties(allParties);
    setDispatchNos(allDispatchNos);
    setProducts(allProducts);
    setReportData(null);
  };

  const handleGenerateReport = async () => {
    setLoading(true);
    setReportData(null);
    try {
      const filters = {
        fromDate:   toApiDate(fromDate),
        toDate:     toApiDate(toDate),
        partyId:    selectedParty?.PartyID    || 'All',
        dispatchNo: selectedDispatchNo?.Trans_No || 'All',
        productId:  selectedProduct?.ItemCode  || 'All',
      };
      const res = await fetchDispatchReport(filters);
      if (res.success && res.data?.length > 0) {
        setReportData(res.data);
      } else {
        Alert.alert('No Data', res.message || 'No dispatch records found for the selected filters.');
      }
    } catch (e) {
      Alert.alert('Error', e?.response?.data?.message || e.message || 'Failed to generate dispatch report.');
    } finally {
      setLoading(false);
    }
  };

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
          <Text style={{ color: '#fff', fontSize: 13, fontWeight: '700' }}>RESET</Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>

        {dropdownLoading && (
          <View style={styles.cascadeBar}>
            <ActivityIndicator size="small" color="#0056b3" />
            <Text style={styles.cascadeText}>Updating filters…</Text>
          </View>
        )}

        <View style={styles.card}>

          {/* ── Date Row (calendar pickers like StockReportScreen) ──────────── */}
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

          {/* ── Party ──────────────────────────────────────────────────────── */}
          <FieldLabel label="PARTY NAME" />
          <TouchableOpacity style={styles.dropdown} onPress={() => setShowPartyModal(true)}>
            <Text style={selectedParty ? styles.dropdownValue : styles.dropdownPlaceholder}>
              {selectedParty ? selectedParty.PartyName : 'All Parties'}
            </Text>
            <Icon name="chevron" size={16} color="#90a4ae" />
          </TouchableOpacity>

          {/* ── Dispatch No. ────────────────────────────────────────────────── */}
          <FieldLabel label="DISPATCH NO." />
          <TouchableOpacity style={styles.dropdown} onPress={() => setShowDispatchModal(true)}>
            <Text style={selectedDispatchNo ? styles.dropdownValue : styles.dropdownPlaceholder}>
              {selectedDispatchNo ? `${selectedDispatchNo.Vouchno || selectedDispatchNo.Trans_No}` : 'All'}
            </Text>
            <Icon name="chevron" size={16} color="#90a4ae" />
          </TouchableOpacity>

          {/* ── Product ─────────────────────────────────────────────────────── */}
          <FieldLabel label="PRODUCT" />
          <TouchableOpacity style={styles.dropdown} onPress={() => setShowProductModal(true)}>
            <Text style={selectedProduct ? styles.dropdownValue : styles.dropdownPlaceholder}>
              {selectedProduct ? `${selectedProduct.ItemCode} — ${selectedProduct.ProductName}` : 'All Products'}
            </Text>
            <Icon name="chevron" size={16} color="#90a4ae" />
          </TouchableOpacity>

          {/* ── Selected chips ───────────────────────────────────────────────── */}
          {(selectedParty || selectedDispatchNo || selectedProduct) && (
            <View style={styles.chipRow}>
              {selectedParty      && <View style={styles.chip}><Text style={styles.chipText}>Party: {selectedParty.PartyName}</Text></View>}
              {selectedDispatchNo && <View style={styles.chip}><Text style={styles.chipText}>Dispatch: {selectedDispatchNo.Vouchno || selectedDispatchNo.Trans_No}</Text></View>}
              {selectedProduct    && <View style={styles.chip}><Text style={styles.chipText}>Product: {selectedProduct.ItemCode}</Text></View>}
            </View>
          )}

          <TouchableOpacity style={styles.generateBtn} onPress={handleGenerateReport} disabled={loading}>
            {loading
              ? <ActivityIndicator color="#fff" />
              : <><Icon name="reports" size={18} color="#fff" /><Text style={styles.generateBtnText}>GENERATE REPORT</Text></>}
          </TouchableOpacity>
        </View>

        {/* ── Results ─────────────────────────────────────────────────────────── */}
        {reportData && (
          <View style={styles.resultsCard}>
            <Text style={styles.resultsTitle}>📦 Dispatch Report</Text>
            <Text style={styles.resultsCount}>{reportData.length} record(s) found</Text>

            {/* Table header */}
            <View style={[styles.tableRow, styles.tableHeader]}>
              <Text style={[styles.th, { flex: 1.2 }]}>Date</Text>
              <Text style={[styles.th, { flex: 1.2 }]}>Dispatch No.</Text>
              <Text style={[styles.th, { flex: 1.8 }]}>Party</Text>
              <Text style={[styles.th, { flex: 0.7, textAlign: 'right' }]}>Qty</Text>
            </View>

            {reportData.map((r, i) => (
              <View key={i} style={[styles.tableRow, i % 2 === 0 && { backgroundColor: '#f8faff' }]}>
                <Text style={[styles.td, { flex: 1.2 }]}>{r.DispatchDate || '-'}</Text>
                <Text style={[styles.td, { flex: 1.2, color: '#0056b3', fontWeight: '700' }]}>{r.DispatchNo || r.DispatchID || '-'}</Text>
                <Text style={[styles.td, { flex: 1.8 }]} numberOfLines={2}>{r.PartyName || '-'}</Text>
                <Text style={[styles.td, { flex: 0.7, textAlign: 'right', color: '#d32f2f', fontWeight: '700' }]}>{r.TotalQty ?? '-'}</Text>
              </View>
            ))}

            {/* Grand total */}
            <View style={styles.subtotalRow}>
              <Text style={[styles.tdBold, { flex: 4.2 }]}>TOTAL</Text>
              <Text style={[styles.tdBold, { flex: 0.7, textAlign: 'right', color: '#d32f2f' }]}>
                {reportData.reduce((s, r) => s + (parseFloat(r.TotalQty) || 0), 0).toFixed(0)}
              </Text>
            </View>
          </View>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* ── Party modal ─────────────────────────────────────────────────────── */}
      <SearchableDropdown
        visible={showPartyModal}
        data={[{ PartyID: null, PartyName: 'All Parties' }, ...parties]}
        title="Select Party"
        placeholder="Search party..."
        renderLabel={(p) => p.PartyName}
        onSelect={(p) => handlePartySelect(p.PartyID === null ? null : p)}
        onClose={() => setShowPartyModal(false)}
      />

      {/* ── Dispatch No. modal ───────────────────────────────────────────────── */}
      <SearchableDropdown
        visible={showDispatchModal}
        data={[{ Trans_No: null, Vouchno: 'All' }, ...dispatchNos]}
        title={`Select Dispatch No.${selectedParty ? ` (${selectedParty.PartyName})` : ''}`}
        placeholder="Search dispatch no..."
        renderLabel={(d) => d.Vouchno ? String(d.Vouchno) : 'All'}
        onSelect={(d) => handleDispatchSelect(d.Trans_No === null ? null : d)}
        onClose={() => setShowDispatchModal(false)}
      />

      {/* ── Product modal ────────────────────────────────────────────────────── */}
      <SearchableDropdown
        visible={showProductModal}
        data={[{ ItemCode: null, ProductName: 'All Products' }, ...products]}
        title={`Select Product${selectedParty ? ` (${selectedParty.PartyName})` : ''}`}
        placeholder="Search product..."
        renderLabel={(p) => p.ItemCode ? `${p.ItemCode} — ${p.ProductName}` : 'All Products'}
        onSelect={(p) => handleProductSelect(p.ItemCode === null ? null : p)}
        onClose={() => setShowProductModal(false)}
      />

      {loading && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color="#0056b3" />
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#f5f7fa' },
  header: { backgroundColor: '#0056b3', flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, height: 80, paddingTop: 20, elevation: 4 },
  headerBack: { marginRight: 8, padding: 4 },
  headerTitle: { flex: 1, color: '#fff', fontSize: 18, fontWeight: '700' },
  scroll: { flex: 1 },
  scrollContent: { padding: 16 },
  cascadeBar: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#e3f2fd', borderRadius: 10, padding: 10, marginBottom: 12, gap: 10 },
  cascadeText: { color: '#0056b3', fontSize: 13, fontWeight: '600' },
  card: { backgroundColor: '#fff', borderRadius: 16, padding: 20, elevation: 3, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 8 },
  row: { flexDirection: 'row', gap: 12 },
  halfCol: { flex: 1 },
  fieldLabel: { fontSize: 11, fontWeight: '700', color: '#78909c', letterSpacing: 0.8, marginBottom: 8, marginTop: 12, textTransform: 'uppercase' },

  // Calendar date button (same style as StockReportScreen)
  dateBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1.5, borderColor: '#e0e7ef', borderRadius: 10, paddingHorizontal: 12, height: 48, backgroundColor: '#fafcff' },
  dateBtnText: { fontSize: 14, color: '#263238', fontWeight: '500' },

  dropdown: { borderWidth: 1.5, borderColor: '#e0e7ef', borderRadius: 10, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', backgroundColor: '#fafcff', height: 48, marginBottom: 4 },
  dropdownPlaceholder: { flex: 1, fontSize: 14, color: '#b0bec5' },
  dropdownValue: { flex: 1, fontSize: 14, color: '#263238', fontWeight: '500' },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 16 },
  chip: { backgroundColor: '#e3f2fd', borderRadius: 20, paddingHorizontal: 12, paddingVertical: 5 },
  chipText: { color: '#0056b3', fontSize: 12, fontWeight: '600' },
  generateBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, backgroundColor: '#0056b3', borderRadius: 12, paddingVertical: 16, marginTop: 24, elevation: 4 },
  generateBtnText: { color: '#fff', fontWeight: '800', fontSize: 15 },

  // Results
  resultsCard: { backgroundColor: '#fff', borderRadius: 16, padding: 16, marginTop: 16, elevation: 3, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 8 },
  resultsTitle: { fontSize: 16, fontWeight: '800', color: '#1a237e' },
  resultsCount: { fontSize: 12, color: '#78909c', marginBottom: 12, marginTop: 2 },
  tableHeader: { backgroundColor: '#0056b3' },
  tableRow: { flexDirection: 'row', paddingVertical: 8, paddingHorizontal: 6, borderBottomWidth: 1, borderBottomColor: '#f0f2f5' },
  th: { fontSize: 11, fontWeight: '800', color: '#fff', letterSpacing: 0.5 },
  td: { fontSize: 11, color: '#263238' },
  tdBold: { fontSize: 12, fontWeight: '800', color: '#1a237e' },
  subtotalRow: { flexDirection: 'row', paddingVertical: 10, paddingHorizontal: 6, backgroundColor: '#e8f0fb', borderRadius: 8, marginTop: 4 },

  // Modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24, height: '70%', padding: 24 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 20 },
  modalTitle: { fontSize: 18, fontWeight: 'bold', color: '#0056b3' },
  closeText: { color: '#e91e63', fontWeight: 'bold' },
  searchBar: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#f5f7fa', borderRadius: 12, paddingHorizontal: 12, height: 48, marginBottom: 16 },
  searchInput: { flex: 1, marginLeft: 10, fontSize: 15 },
  listItem: { paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: '#f0f2f5' },
  listItemText: { fontSize: 15, color: '#333', fontWeight: '500' },
  loadingOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(255,255,255,0.7)', justifyContent: 'center', alignItems: 'center', zIndex: 1000 },
});
