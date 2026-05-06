import React, { useState, useEffect, useCallback } from "react";
import {
  View, Text, TextInput, TouchableOpacity, ScrollView,
  StyleSheet, SafeAreaView, StatusBar, Alert, ActivityIndicator,
  Modal, FlatList,
} from "react-native";
import {
  fetchParties,
  fetchProducts,
  fetchOrderNumbers,
  fetchPendingOrderReport
} from "../services/api";
import Icon from "../components/Icon";

// ── Reusable components ───────────────────────────────────────────────────────
const FieldLabel = ({ label }) => <Text style={styles.fieldLabel}>{label}</Text>;
const SectionCard = ({ children }) => <View style={styles.card}>{children}</View>;

const SearchableDropdown = ({ visible, data, onSelect, onClose, title, placeholder, isSimple = false }) => {
  const [search, setSearch] = useState("");
  const filtered = data.filter(item => {
    const val = isSimple ? String(item) : (item.PartyName || item.ProductName || item.ItemCode || "");
    return val.toLowerCase().includes(search.toLowerCase());
  });

  return (
    <Modal visible={visible} animationType="slide" transparent={true}>
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>{title}</Text>
            <TouchableOpacity onPress={onClose}><Text style={styles.closeText}>Cancel</Text></TouchableOpacity>
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
            keyExtractor={(_, index) => index.toString()}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={styles.listItem}
                onPress={() => { onSelect(item); setSearch(""); }}
              >
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

export default function PendingReportScreen({ navigation }) {
  const [loading, setLoading] = useState(false);
  const [dropdownLoading, setDropdownLoading] = useState(false);

  // Master lists (unfiltered)
  const [allParties, setAllParties] = useState([]);
  const [allProducts, setAllProducts] = useState([]);
  const [allOrderNumbers, setAllOrderNumbers] = useState([]);

  // Filtered lists (shown in dropdowns)
  const [parties, setParties] = useState([]);
  const [products, setProducts] = useState([]);
  const [orderNumbers, setOrderNumbers] = useState([]);

  // Form State
  const [fromDate, setFromDate] = useState(new Date().toISOString().split('T')[0]);
  const [toDate, setToDate] = useState(new Date().toISOString().split('T')[0]);
  const [selectedParty, setSelectedParty] = useState(null);
  const [selectedOrderNo, setSelectedOrderNo] = useState(null);
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [isPendingOnly, setIsPendingOnly] = useState(true);

  // Modals
  const [showPartyModal, setShowPartyModal] = useState(false);
  const [showOrderModal, setShowOrderModal] = useState(false);
  const [showProductModal, setShowProductModal] = useState(false);

  // ── Load all data on mount ─────────────────────────────────────────────────
  useEffect(() => {
    loadAllDropdowns();
  }, []);

  const loadAllDropdowns = async () => {
    try {
      const [pData, prodData, oNumData] = await Promise.all([
        fetchParties(),
        fetchProducts(),
        fetchOrderNumbers()
      ]);
      const p = pData.data || [];
      const prod = prodData.data || [];
      const o = oNumData.data || [];
      setAllParties(p);   setParties(p);
      setAllProducts(prod); setProducts(prod);
      setAllOrderNumbers(o); setOrderNumbers(o);
    } catch (err) {
      console.error("Failed to load dropdown data", err);
    }
  };

  // ── Cascade: when party changes ────────────────────────────────────────────
  const handlePartySelect = useCallback(async (party) => {
    const isAll = !party || party.PartyID === 'All';
    setSelectedParty(isAll ? null : party);
    setSelectedOrderNo(null);   // reset dependent
    setSelectedProduct(null);   // reset dependent
    setShowPartyModal(false);

    if (isAll) {
      setOrderNumbers(allOrderNumbers);
      setProducts(allProducts);
      return;
    }

    setDropdownLoading(true);
    try {
      const [oData, prodData] = await Promise.all([
        fetchOrderNumbers({ partyId: party.PartyID }),
        fetchProducts({ partyId: party.PartyID }),
      ]);
      setOrderNumbers(oData.data || []);
      setProducts(prodData.data || []);
    } catch (e) {
      console.error("Cascade party error", e);
    } finally {
      setDropdownLoading(false);
    }
  }, [allOrderNumbers, allProducts]);

  // ── Cascade: when order number changes ────────────────────────────────────
  const handleOrderNoSelect = useCallback(async (orderNo) => {
    const isAll = !orderNo || orderNo === 'All';
    setSelectedOrderNo(isAll ? null : orderNo);
    setSelectedProduct(null);   // reset product
    setShowOrderModal(false);

    if (isAll) {
      // Restore to party-filtered or all
      const partyId = selectedParty?.PartyID;
      setDropdownLoading(true);
      try {
        const prodData = await fetchProducts(partyId ? { partyId } : {});
        setProducts(prodData.data || []);
      } catch (e) { console.error("Cascade orderNo reset error", e); }
      finally { setDropdownLoading(false); }
      return;
    }

    setDropdownLoading(true);
    try {
      const params = { orderNo };
      if (selectedParty?.PartyID) params.partyId = selectedParty.PartyID;
      const prodData = await fetchProducts(params);
      setProducts(prodData.data || []);
    } catch (e) {
      console.error("Cascade orderNo error", e);
    } finally {
      setDropdownLoading(false);
    }
  }, [selectedParty, allProducts]);

  // ── Cascade: when product changes ─────────────────────────────────────────
  const handleProductSelect = useCallback(async (product) => {
    const isAll = !product || product.ItemCode === 'All';
    setSelectedProduct(isAll ? null : product);
    setSelectedOrderNo(null);   // reset order no
    setShowProductModal(false);

    if (isAll) {
      const partyId = selectedParty?.PartyID;
      setDropdownLoading(true);
      try {
        const oData = await fetchOrderNumbers(partyId ? { partyId } : {});
        setOrderNumbers(oData.data || []);
      } catch (e) { console.error("Cascade product reset error", e); }
      finally { setDropdownLoading(false); }
      return;
    }

    setDropdownLoading(true);
    try {
      const params = { productId: product.ItemCode };
      if (selectedParty?.PartyID) params.partyId = selectedParty.PartyID;
      const oData = await fetchOrderNumbers(params);
      setOrderNumbers(oData.data || []);
    } catch (e) {
      console.error("Cascade product error", e);
    } finally {
      setDropdownLoading(false);
    }
  }, [selectedParty, allOrderNumbers]);

  // ── Reset all filters ──────────────────────────────────────────────────────
  const handleReset = () => {
    setSelectedParty(null);
    setSelectedOrderNo(null);
    setSelectedProduct(null);
    setParties(allParties);
    setOrderNumbers(allOrderNumbers);
    setProducts(allProducts);
    setIsPendingOnly(true);
  };

  // ── Generate report ────────────────────────────────────────────────────────
  const handleGenerateReport = async () => {
    setLoading(true);
    try {
      const filters = {
        fromDate, toDate,
        partyId: selectedParty?.PartyID || 'All',
        orderNo: selectedOrderNo || 'All',
        productId: selectedProduct?.ItemCode || 'All',
        pendingOnly: isPendingOnly
      };
      const res = await fetchPendingOrderReport(filters);
      if (res.success) {
        Alert.alert("Report Generated", `Found ${res.data.length} matching order(s).`);
      }
    } catch (err) {
      Alert.alert("Error", "Failed to generate report.");
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
        <Text style={styles.headerTitle}>Pending Order Report</Text>
        <TouchableOpacity onPress={handleReset} style={{ padding: 4 }}>
          <Text style={{ color: '#fff', fontSize: 13, fontWeight: '700' }}>RESET</Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        <Text style={styles.pageTitle}>Report Filters</Text>

        {dropdownLoading && (
          <View style={styles.cascadeBar}>
            <ActivityIndicator size="small" color="#0056b3" />
            <Text style={styles.cascadeText}>Updating filters…</Text>
          </View>
        )}

        <SectionCard>
          {/* Dates */}
          <View style={styles.row}>
            <View style={styles.halfCol}>
              <FieldLabel label="FROM DATE" />
              <TextInput style={styles.input} value={fromDate} onChangeText={setFromDate} placeholder="YYYY-MM-DD" />
            </View>
            <View style={styles.halfCol}>
              <FieldLabel label="TILL DATE" />
              <TextInput style={styles.input} value={toDate} onChangeText={setToDate} placeholder="YYYY-MM-DD" />
            </View>
          </View>

          {/* Party */}
          <FieldLabel label="PARTY NAME" />
          <TouchableOpacity style={styles.dropdown} onPress={() => setShowPartyModal(true)}>
            <Text style={selectedParty ? styles.dropdownValue : styles.dropdownPlaceholder}>
              {selectedParty ? selectedParty.PartyName : "All Parties"}
            </Text>
            <Icon name="chevron" size={16} color="#90a4ae" />
          </TouchableOpacity>

          {/* Order No + Pending toggle */}
          <View style={styles.row}>
            <View style={styles.halfCol}>
              <FieldLabel label="ORDER NO." />
              <TouchableOpacity style={styles.dropdown} onPress={() => setShowOrderModal(true)}>
                <Text style={selectedOrderNo ? styles.dropdownValue : styles.dropdownPlaceholder}>
                  {selectedOrderNo ? String(selectedOrderNo) : "All"}
                </Text>
                <Icon name="chevron" size={16} color="#90a4ae" />
              </TouchableOpacity>
            </View>
            <View style={styles.halfCol}>
              <FieldLabel label="PENDING STATUS" />
              <TouchableOpacity
                style={[styles.checkboxContainer, isPendingOnly && styles.checkboxActive]}
                onPress={() => setIsPendingOnly(!isPendingOnly)}
              >
                <View style={[styles.checkbox, isPendingOnly && styles.checkboxInnerActive]} />
                <Text style={[styles.checkboxLabel, isPendingOnly && styles.checkboxLabelActive]}>Pending Only</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Product */}
          <FieldLabel label="PRODUCT" />
          <TouchableOpacity style={styles.dropdown} onPress={() => setShowProductModal(true)}>
            <Text style={selectedProduct ? styles.dropdownValue : styles.dropdownPlaceholder}>
              {selectedProduct ? `${selectedProduct.ItemCode} - ${selectedProduct.ProductName}` : "All Products"}
            </Text>
            <Icon name="chevron" size={16} color="#90a4ae" />
          </TouchableOpacity>

          {/* Active filter chips */}
          {(selectedParty || selectedOrderNo || selectedProduct) && (
            <View style={styles.chipRow}>
              {selectedParty && <View style={styles.chip}><Text style={styles.chipText}>Party: {selectedParty.PartyName}</Text></View>}
              {selectedOrderNo && <View style={styles.chip}><Text style={styles.chipText}>Order: {selectedOrderNo}</Text></View>}
              {selectedProduct && <View style={styles.chip}><Text style={styles.chipText}>Product: {selectedProduct.ItemCode}</Text></View>}
            </View>
          )}

          <TouchableOpacity style={styles.reportBtn} onPress={handleGenerateReport}>
            <Icon name="reports" size={18} color="#fff" />
            <Text style={styles.reportBtnText}>GENERATE REPORT</Text>
          </TouchableOpacity>
        </SectionCard>
      </ScrollView>

      {/* Party Modal */}
      <SearchableDropdown
        visible={showPartyModal}
        data={[{ PartyID: 'All', PartyName: 'All Parties' }, ...parties]}
        title="Select Party"
        placeholder="Search party..."
        onSelect={(p) => handlePartySelect(p.PartyID === 'All' ? null : p)}
        onClose={() => setShowPartyModal(false)}
      />

      {/* Order Number Modal */}
      <SearchableDropdown
        visible={showOrderModal}
        data={['All', ...orderNumbers]}
        isSimple={true}
        title={`Select Order No.${selectedParty ? ` (${selectedParty.PartyName})` : ''}`}
        placeholder="Search order no..."
        onSelect={(o) => handleOrderNoSelect(o === 'All' ? null : o)}
        onClose={() => setShowOrderModal(false)}
      />

      {/* Product Modal */}
      <SearchableDropdown
        visible={showProductModal}
        data={[{ ItemCode: 'All', ProductName: 'All Products' }, ...products]}
        title={`Select Product${selectedParty ? ` (${selectedParty.PartyName})` : ''}`}
        placeholder="Search product..."
        onSelect={(p) => handleProductSelect(p.ItemCode === 'All' ? null : p)}
        onClose={() => setShowProductModal(false)}
      />

      {loading && (
        <View style={styles.loadingOverlay}><ActivityIndicator size="large" color="#0056b3" /></View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#f5f7fa" },
  header: {
    backgroundColor: "#0056b3", flexDirection: "row", alignItems: "center",
    paddingHorizontal: 14, height: 80, paddingTop: 20, elevation: 4,
  },
  headerBack: { marginRight: 8, padding: 4 },
  headerTitle: { flex: 1, color: "#fff", fontSize: 18, fontWeight: "700" },
  scroll: { flex: 1 },
  scrollContent: { padding: 16 },
  pageTitle: { fontSize: 20, fontWeight: "bold", color: "#1a237e", marginBottom: 16 },
  cascadeBar: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: '#e3f2fd',
    borderRadius: 10, padding: 10, marginBottom: 12, gap: 10,
  },
  cascadeText: { color: '#0056b3', fontSize: 13, fontWeight: '600' },
  card: {
    backgroundColor: "#fff", borderRadius: 16, padding: 20, elevation: 3,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 8,
  },
  row: { flexDirection: "row", gap: 12 },
  halfCol: { flex: 1 },
  fieldLabel: {
    fontSize: 11, fontWeight: "700", color: "#78909c", letterSpacing: 0.8,
    marginBottom: 8, marginTop: 12, textTransform: "uppercase",
  },
  input: {
    borderWidth: 1.5, borderColor: "#e0e7ef", borderRadius: 10, paddingHorizontal: 12,
    fontSize: 14, color: "#263238", backgroundColor: "#fafcff", height: 48,
  },
  dropdown: {
    borderWidth: 1.5, borderColor: "#e0e7ef", borderRadius: 10, paddingHorizontal: 12,
    flexDirection: "row", alignItems: "center", backgroundColor: "#fafcff", height: 48, marginBottom: 4,
  },
  dropdownPlaceholder: { flex: 1, fontSize: 14, color: "#b0bec5" },
  dropdownValue: { flex: 1, fontSize: 14, color: "#263238", fontWeight: "500" },
  checkboxContainer: {
    flexDirection: "row", alignItems: "center", borderWidth: 1.5, borderColor: "#e0e7ef",
    borderRadius: 10, paddingHorizontal: 12, height: 48, backgroundColor: "#fafcff",
  },
  checkboxActive: { borderColor: "#0056b3", backgroundColor: "#e3f2fd" },
  checkbox: { width: 18, height: 18, borderRadius: 4, borderWidth: 2, borderColor: "#90a4ae", marginRight: 10 },
  checkboxInnerActive: { backgroundColor: "#0056b3", borderColor: "#0056b3" },
  checkboxLabel: { fontSize: 13, color: "#78909c", fontWeight: "600" },
  checkboxLabelActive: { color: "#0056b3" },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 16 },
  chip: { backgroundColor: '#e3f2fd', borderRadius: 20, paddingHorizontal: 12, paddingVertical: 5 },
  chipText: { color: '#0056b3', fontSize: 12, fontWeight: '600' },
  reportBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    backgroundColor: "#0056b3", borderRadius: 12, paddingVertical: 16, marginTop: 24, elevation: 4,
  },
  reportBtnText: { color: "#fff", fontWeight: "800", fontSize: 15, marginLeft: 10 },
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" },
  modalContent: { backgroundColor: "#fff", borderTopLeftRadius: 24, borderTopRightRadius: 24, height: "70%", padding: 24 },
  modalHeader: { flexDirection: "row", justifyContent: "space-between", marginBottom: 20 },
  modalTitle: { fontSize: 18, fontWeight: "bold", color: "#0056b3" },
  closeText: { color: "#e91e63", fontWeight: "bold" },
  searchBar: { flexDirection: "row", alignItems: "center", backgroundColor: "#f5f7fa", borderRadius: 12, paddingHorizontal: 12, height: 48, marginBottom: 16 },
  searchInput: { flex: 1, marginLeft: 10, fontSize: 15 },
  listItem: { paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: "#f0f2f5" },
  listItemText: { fontSize: 15, color: "#333", fontWeight: "500" },
  loadingOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(255,255,255,0.7)', justifyContent: 'center', alignItems: 'center', zIndex: 1000 },
});
