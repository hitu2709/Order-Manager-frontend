import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  SafeAreaView,
  StatusBar,
  Alert,
  ActivityIndicator,
  Modal,
  FlatList,
} from "react-native";
import { 
  fetchParties, 
  fetchProducts, 
  fetchOrderNumbers, 
  fetchPendingOrderReport 
} from "../services/api";
import Icon from "../components/Icon";

// ── Reusable components (Shared from CreateOrderScreen patterns) ─────────────
const FieldLabel = ({ label }) => (
  <Text style={styles.fieldLabel}>{label}</Text>
);

const SectionCard = ({ children, style }) => (
  <View style={[styles.card, style]}>{children}</View>
);

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
            keyExtractor={(item, index) => index.toString()}
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

  useEffect(() => {
    loadDropdownData();
  }, []);

  const loadDropdownData = async () => {
    try {
      const [pData, prodData, oNumData] = await Promise.all([
        fetchParties(),
        fetchProducts(),
        fetchOrderNumbers()
      ]);
      setParties(pData.data || []);
      setProducts(prodData.data || []);
      setOrderNumbers(oNumData.data || []);
    } catch (err) {
      console.error("Failed to load dropdown data", err);
    }
  };

  const handleGenerateReport = async () => {
    setLoading(true);
    try {
      const filters = {
        fromDate,
        toDate,
        partyId: selectedParty?.PartyID || 'All',
        orderNo: selectedOrderNo || 'All',
        productId: selectedProduct?.ItemCode || 'All',
        pendingOnly: isPendingOnly
      };

      const res = await fetchPendingOrderReport(filters);
      if (res.success) {
        // For now, we'll just show an alert with the count.
        // In a real app, we would navigate to a results screen.
        Alert.alert("Report Generated", `Found ${res.data.length} matching orders.`);
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
        <View style={{ width: 40 }} />
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        <Text style={styles.pageTitle}>Report Filters</Text>

        <SectionCard>
          <View style={styles.row}>
            <View style={styles.halfCol}>
              <FieldLabel label="FROM DATE" />
              <TextInput 
                style={styles.input} 
                value={fromDate} 
                onChangeText={setFromDate} 
                placeholder="YYYY-MM-DD"
              />
            </View>
            <View style={styles.halfCol}>
              <FieldLabel label="TILL DATE" />
              <TextInput 
                style={styles.input} 
                value={toDate} 
                onChangeText={setToDate} 
                placeholder="YYYY-MM-DD"
              />
            </View>
          </View>

          <FieldLabel label="PARTY NAME" />
          <TouchableOpacity style={styles.dropdown} onPress={() => setShowPartyModal(true)}>
            <Text style={selectedParty ? styles.dropdownValue : styles.dropdownPlaceholder}>
              {selectedParty ? selectedParty.PartyName : "All Parties"}
            </Text>
            <Icon name="chevron" size={16} color="#90a4ae" />
          </TouchableOpacity>

          <View style={styles.row}>
            <View style={styles.halfCol}>
              <FieldLabel label="ORDER NO." />
              <TouchableOpacity style={styles.dropdown} onPress={() => setShowOrderModal(true)}>
                <Text style={selectedOrderNo ? styles.dropdownValue : styles.dropdownPlaceholder}>
                  {selectedOrderNo ? selectedOrderNo : "All"}
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

          <FieldLabel label="PRODUCT" />
          <TouchableOpacity style={styles.dropdown} onPress={() => setShowProductModal(true)}>
            <Text style={selectedProduct ? styles.dropdownValue : styles.dropdownPlaceholder}>
              {selectedProduct ? `${selectedProduct.ItemCode} - ${selectedProduct.ProductName}` : "All Products"}
            </Text>
            <Icon name="chevron" size={16} color="#90a4ae" />
          </TouchableOpacity>

          <TouchableOpacity style={styles.reportBtn} onPress={handleGenerateReport}>
            <Icon name="reports" size={18} color="#fff" />
            <Text style={styles.reportBtnText}>GENERATE REPORT</Text>
          </TouchableOpacity>
        </SectionCard>
      </ScrollView>

      {/* Modals */}
      <SearchableDropdown 
        visible={showPartyModal}
        data={[{ PartyID: 'All', PartyName: 'All Parties' }, ...parties]}
        title="Select Party"
        placeholder="Search party..."
        onSelect={(p) => { setSelectedParty(p.PartyID === 'All' ? null : p); setShowPartyModal(false); }}
        onClose={() => setShowPartyModal(false)}
      />

      <SearchableDropdown 
        visible={showOrderModal}
        data={['All', ...orderNumbers]}
        isSimple={true}
        title="Select Order Number"
        placeholder="Search order no..."
        onSelect={(o) => { setSelectedOrderNo(o === 'All' ? null : o); setShowOrderModal(false); }}
        onClose={() => setShowOrderModal(false)}
      />

      <SearchableDropdown 
        visible={showProductModal}
        data={[{ ItemCode: 'All', ProductName: 'All Products' }, ...products]}
        title="Select Product"
        placeholder="Search product..."
        onSelect={(p) => { setSelectedProduct(p.ItemCode === 'All' ? null : p); setShowProductModal(false); }}
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
    backgroundColor: "#0056b3",
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    height: 80,
    paddingTop: 20,
    elevation: 4,
  },
  headerBack: { marginRight: 8, padding: 4 },
  headerTitle: { flex: 1, color: "#fff", fontSize: 18, fontWeight: "700" },
  scroll: { flex: 1 },
  scrollContent: { padding: 16 },
  pageTitle: { fontSize: 20, fontWeight: "bold", color: "#1a237e", marginBottom: 20 },
  card: { backgroundColor: "#fff", borderRadius: 16, padding: 20, elevation: 3, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 8 },
  row: { flexDirection: "row", gap: 12 },
  halfCol: { flex: 1 },
  fieldLabel: { fontSize: 11, fontWeight: "700", color: "#78909c", letterSpacing: 0.8, marginBottom: 8, marginTop: 12, textTransform: "uppercase" },
  input: { borderWidth: 1.5, borderColor: "#e0e7ef", borderRadius: 10, paddingHorizontal: 12, fontSize: 14, color: "#263238", backgroundColor: "#fafcff", height: 48 },
  dropdown: { borderWidth: 1.5, borderColor: "#e0e7ef", borderRadius: 10, paddingHorizontal: 12, flexDirection: "row", alignItems: "center", backgroundColor: "#fafcff", height: 48, marginBottom: 4 },
  dropdownPlaceholder: { flex: 1, fontSize: 14, color: "#b0bec5" },
  dropdownValue: { flex: 1, fontSize: 14, color: "#263238", fontWeight: "500" },
  checkboxContainer: { flexDirection: "row", alignItems: "center", borderWidth: 1.5, borderColor: "#e0e7ef", borderRadius: 10, paddingHorizontal: 12, height: 48, backgroundColor: "#fafcff" },
  checkboxActive: { borderColor: "#0056b3", backgroundColor: "#e3f2fd" },
  checkbox: { width: 18, height: 18, borderRadius: 4, borderWidth: 2, borderColor: "#90a4ae", marginRight: 10 },
  checkboxInnerActive: { backgroundColor: "#0056b3", borderColor: "#0056b3" },
  checkboxLabel: { fontSize: 13, color: "#78909c", fontWeight: "600" },
  checkboxLabelActive: { color: "#0056b3" },
  reportBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", backgroundColor: "#0056b3", borderRadius: 12, paddingVertical: 16, marginTop: 30, elevation: 4 },
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
