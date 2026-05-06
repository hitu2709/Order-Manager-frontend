import React, { useState, useEffect, useCallback } from "react";
import {
  View, Text, TextInput, TouchableOpacity, ScrollView,
  StyleSheet, SafeAreaView, StatusBar, Alert, ActivityIndicator,
  Modal, FlatList,
} from "react-native";
import { fetchProducts, fetchSupplierOrderReport } from "../services/api";
import Icon from "../components/Icon";

const FieldLabel = ({ label }) => <Text style={styles.fieldLabel}>{label}</Text>;
const SectionCard = ({ children }) => <View style={styles.card}>{children}</View>;

const SearchableDropdown = ({ visible, data, onSelect, onClose, title, placeholder }) => {
  const [search, setSearch] = useState("");
  const filtered = data.filter(item => {
    const val = item.GroupName || item.ProductName || item.ItemCode || "";
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
            <TextInput style={styles.searchInput} placeholder={placeholder} value={search} onChangeText={setSearch} autoFocus />
          </View>
          <FlatList
            data={filtered}
            keyExtractor={(_, i) => i.toString()}
            renderItem={({ item }) => (
              <TouchableOpacity style={styles.listItem} onPress={() => { onSelect(item); setSearch(""); }}>
                <Text style={styles.listItemText}>{item.GroupName || item.ProductName || item.ItemCode}</Text>
              </TouchableOpacity>
            )}
          />
        </View>
      </View>
    </Modal>
  );
};

export default function SupplierOrderReportScreen({ navigation }) {
  const [loading, setLoading] = useState(false);

  const [allProducts, setAllProducts] = useState([]);
  const [allGroups, setAllGroups] = useState([]);
  const [filteredProducts, setFilteredProducts] = useState([]);

  const today = new Date().toISOString().split('T')[0];
  const [fromDate, setFromDate] = useState(today);
  const [toDate, setToDate] = useState(today);
  const [selectedGroup, setSelectedGroup] = useState(null);
  const [selectedProduct, setSelectedProduct] = useState(null);

  const [showGroupModal, setShowGroupModal] = useState(false);
  const [showProductModal, setShowProductModal] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const prodData = await fetchProducts();
        const prods = prodData.data || [];
        setAllProducts(prods);
        setFilteredProducts(prods);
        // Derive unique product groups from the Unit field
        const seen = new Set();
        const groups = [];
        for (const p of prods) {
          if (p.Unit && !seen.has(p.Unit)) {
            seen.add(p.Unit);
            groups.push({ GroupCode: p.Unit, GroupName: p.Unit });
          }
        }
        setAllGroups(groups.sort((a, b) => a.GroupName.localeCompare(b.GroupName)));
      } catch (e) { console.error("Failed to load supplier dropdowns", e); }
    })();
  }, []);

  // Group → filter products locally (no backend call needed)
  const handleGroupSelect = useCallback((group) => {
    const isAll = !group || group.GroupCode === 'All';
    setSelectedGroup(isAll ? null : group);
    setSelectedProduct(null);
    setShowGroupModal(false);
    if (isAll) {
      setFilteredProducts(allProducts);
    } else {
      setFilteredProducts(allProducts.filter(p => p.Unit === group.GroupCode));
    }
  }, [allProducts]);

  // Product → cascade group (find group of selected product)
  const handleProductSelect = useCallback((product) => {
    const isAll = !product || product.ItemCode === 'All';
    setSelectedProduct(isAll ? null : product);
    setShowProductModal(false);
    if (!isAll && product.Unit) {
      // auto-select the group if product has a group
      const grp = allGroups.find(g => g.GroupCode === product.Unit);
      setSelectedGroup(grp || null);
      setFilteredProducts(allProducts.filter(p => p.Unit === product.Unit));
    }
  }, [allGroups, allProducts]);

  const handleReset = () => {
    setSelectedGroup(null);
    setSelectedProduct(null);
    setFilteredProducts(allProducts);
  };

  const handleGenerateReport = async () => {
    setLoading(true);
    try {
      const filters = {
        fromDate, toDate,
        productGroup: selectedGroup?.GroupCode || 'All',
        productId: selectedProduct?.ItemCode || 'All',
      };
      const res = await fetchSupplierOrderReport(filters);
      if (res.success) {
        Alert.alert("Report Generated", `Found ${res.data?.length ?? 0} supplier order record(s).`);
      } else {
        Alert.alert("No Data", res.message || "No records found.");
      }
    } catch (e) {
      Alert.alert("Error", "Failed to generate supplier order report.");
    } finally { setLoading(false); }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar backgroundColor="#0056b3" barStyle="light-content" />
      <View style={styles.header}>
        <TouchableOpacity style={styles.headerBack} onPress={() => navigation.goBack()}>
          <Icon name="back" size={22} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Supplier Order Report</Text>
        <TouchableOpacity onPress={handleReset} style={{ padding: 4 }}>
          <Text style={{ color: '#fff', fontSize: 13, fontWeight: '700' }}>RESET</Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        <Text style={styles.pageTitle}>Report Filters</Text>

        <SectionCard>
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

          <FieldLabel label="PRODUCT GROUP" />
          <TouchableOpacity style={styles.dropdown} onPress={() => setShowGroupModal(true)}>
            <Text style={selectedGroup ? styles.dropdownValue : styles.dropdownPlaceholder}>
              {selectedGroup ? selectedGroup.GroupName : "All Groups"}
            </Text>
            <Icon name="chevron" size={16} color="#90a4ae" />
          </TouchableOpacity>

          <FieldLabel label={`PRODUCT${selectedGroup ? ` (${filteredProducts.length} available)` : ''}`} />
          <TouchableOpacity style={styles.dropdown} onPress={() => setShowProductModal(true)}>
            <Text style={selectedProduct ? styles.dropdownValue : styles.dropdownPlaceholder}>
              {selectedProduct ? `${selectedProduct.ItemCode} - ${selectedProduct.ProductName}` : "All Products"}
            </Text>
            <Icon name="chevron" size={16} color="#90a4ae" />
          </TouchableOpacity>

          {(selectedGroup || selectedProduct) && (
            <View style={styles.chipRow}>
              {selectedGroup && <View style={styles.chip}><Text style={styles.chipText}>Group: {selectedGroup.GroupName}</Text></View>}
              {selectedProduct && <View style={styles.chip}><Text style={styles.chipText}>Product: {selectedProduct.ItemCode}</Text></View>}
            </View>
          )}

          <TouchableOpacity style={styles.reportBtn} onPress={handleGenerateReport}>
            <Icon name="reports" size={18} color="#fff" />
            <Text style={styles.reportBtnText}>GENERATE REPORT</Text>
          </TouchableOpacity>
        </SectionCard>
      </ScrollView>

      <SearchableDropdown
        visible={showGroupModal}
        data={[{ GroupCode: 'All', GroupName: 'All Groups' }, ...allGroups]}
        title="Select Product Group" placeholder="Search group..."
        onSelect={(g) => handleGroupSelect(g.GroupCode === 'All' ? null : g)}
        onClose={() => setShowGroupModal(false)}
      />
      <SearchableDropdown
        visible={showProductModal}
        data={[{ ItemCode: 'All', ProductName: 'All Products' }, ...filteredProducts]}
        title={`Select Product${selectedGroup ? ` (${selectedGroup.GroupName})` : ''}`}
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
  header: { backgroundColor: "#0056b3", flexDirection: "row", alignItems: "center", paddingHorizontal: 14, height: 80, paddingTop: 20, elevation: 4 },
  headerBack: { marginRight: 8, padding: 4 },
  headerTitle: { flex: 1, color: "#fff", fontSize: 18, fontWeight: "700" },
  scroll: { flex: 1 },
  scrollContent: { padding: 16 },
  pageTitle: { fontSize: 20, fontWeight: "bold", color: "#1a237e", marginBottom: 16 },
  card: { backgroundColor: "#fff", borderRadius: 16, padding: 20, elevation: 3, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 8 },
  row: { flexDirection: "row", gap: 12 },
  halfCol: { flex: 1 },
  fieldLabel: { fontSize: 11, fontWeight: "700", color: "#78909c", letterSpacing: 0.8, marginBottom: 8, marginTop: 12, textTransform: "uppercase" },
  input: { borderWidth: 1.5, borderColor: "#e0e7ef", borderRadius: 10, paddingHorizontal: 12, fontSize: 14, color: "#263238", backgroundColor: "#fafcff", height: 48 },
  dropdown: { borderWidth: 1.5, borderColor: "#e0e7ef", borderRadius: 10, paddingHorizontal: 12, flexDirection: "row", alignItems: "center", backgroundColor: "#fafcff", height: 48, marginBottom: 4 },
  dropdownPlaceholder: { flex: 1, fontSize: 14, color: "#b0bec5" },
  dropdownValue: { flex: 1, fontSize: 14, color: "#263238", fontWeight: "500" },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 16 },
  chip: { backgroundColor: '#e3f2fd', borderRadius: 20, paddingHorizontal: 12, paddingVertical: 5 },
  chipText: { color: '#0056b3', fontSize: 12, fontWeight: '600' },
  reportBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", backgroundColor: "#0056b3", borderRadius: 12, paddingVertical: 16, marginTop: 24, elevation: 4 },
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
