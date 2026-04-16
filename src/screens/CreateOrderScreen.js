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
  Image,
  Platform,
  Alert,
  ActivityIndicator,
  Modal,
  FlatList,
  Dimensions,
} from "react-native";
import { CameraView, useCameraPermissions } from 'expo-camera';
import { createOrder, updateOrder, fetchParties, fetchProducts, fetchSalesmen } from "../services/api";

import Icon from "../components/Icon";

// ── Reusable components ──────────────────────────────────────────────────────
const FieldLabel = ({ label }) => (
  <Text style={styles.fieldLabel}>{label}</Text>
);

const SectionCard = ({ children, style }) => (
  <View style={[styles.card, style]}>{children}</View>
);

const RadioGroup = ({ options, selected, onSelect }) => (
  <View style={styles.radioRow}>
    {options.map((opt) => (
      <TouchableOpacity
        key={opt}
        style={styles.radioItem}
        onPress={() => onSelect(opt)}
        activeOpacity={0.7}
      >
        <View style={[styles.radioCircle, selected === opt && styles.radioCircleActive]}>
          {selected === opt && <View style={styles.radioDot} />}
        </View>
        <Text style={styles.radioLabel}>{opt}</Text>
      </TouchableOpacity>
    ))}
  </View>
);

const InputField = ({
  placeholder,
  value,
  onChangeText,
  editable = true,
  multiline = false,
  numberOfLines = 1,
  keyboardType = "default",
}) => (
  <TextInput
    style={[styles.input, multiline && { height: 80, textAlignVertical: "top" }]}
    placeholder={placeholder}
    placeholderTextColor="#b0bec5"
    value={value}
    onChangeText={onChangeText}
    editable={editable}
    multiline={multiline}
    numberOfLines={numberOfLines}
    keyboardType={keyboardType}
  />
);

const SearchableDropdown = ({ visible, data, onSelect, onClose, title, placeholder, isProduct = false, hideCode = false }) => {
  const [search, setSearch] = useState("");
  const filtered = data.filter(item => 
    (item.PartyName || item.ProductName || item.ItemCode || item.ac_name || "").toLowerCase().includes(search.toLowerCase())
  );

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
            keyExtractor={(item, index) => (item.PartyID ?? item.ProductID ?? item.ac_code ?? index).toString()}
            renderItem={({ item }) => (
              <TouchableOpacity 
                style={styles.listItem} 
                onPress={() => { onSelect(item); setSearch(""); }}
              >
                {isProduct ? (
                  // Product row: name first, code as small badge below
                  <View style={{ paddingVertical: 2 }}>
                    <Text style={[styles.listItemText, { marginBottom: 4 }]} numberOfLines={2}>{item.ProductName || 'N/A'}</Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                      <View style={{ backgroundColor: '#EEF2FF', paddingHorizontal: 7, paddingVertical: 2, borderRadius: 4 }}>
                        <Text style={{ fontSize: 11, fontWeight: '700', color: '#4F46E5' }}>{item.ItemCode || '—'}</Text>
                      </View>
                    </View>
                  </View>
                ) : (
                  // Party / Salesman row
                  <View style={styles.listItemGrid}>
                    <View style={styles.flex1}>
                      <Text style={styles.listItemText}>{item.PartyName || item.ac_name || 'N/A'}</Text>
                      {item.ac_code && (
                        <Text style={styles.listItemSubText}>{item.ac_code}</Text>
                      )}
                    </View>
                  </View>
                )}
              </TouchableOpacity>
            )}
          />
        </View>
      </View>
    </Modal>
  );
};

export default function CreateOrderScreen({ navigation, route }) {
  const editOrder = route.params?.editOrder;
  const isEditMode = !!editOrder;
  const [loading, setLoading] = useState(false);
  const [parties, setParties] = useState([]);
  const [products, setProducts] = useState([]);
  const [salesmenData, setSalesmenData] = useState([]);
  
  // Data State
  const [orderNo, setOrderNo] = useState("ORD-2024-001");
  const [selectedParty, setSelectedParty] = useState(null);
  const [transport, setTransport] = useState("");
  const [notes, setNotes] = useState("");
  const [selectedSalesman, setSelectedSalesman] = useState(null);
  
  // Product Logic State
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [flag, setFlag] = useState("1");
  const [adjustment, setAdjustment] = useState("R");
  const [adjustmentValue, setAdjustmentValue] = useState("0.00");
  const [qty, setQty] = useState("");
  const [rate, setRate] = useState("");
  const [discountPercent, setDiscountPercent] = useState("0");
  const [remark, setRemark] = useState("");
  const [productsList, setProductsList] = useState([]);

  // Modals
  const [showPartyModal, setShowPartyModal] = useState(false);
  const [showProductModal, setShowProductModal] = useState(false);
  const [showSalesmanModal, setShowSalesmanModal] = useState(false);
  const [showAdjModal, setShowAdjModal] = useState(false);



  // QR/Barcode Scanner
  const [showScanner, setShowScanner] = useState(false);
  const [scanned, setScanned] = useState(false);
  const [permission, requestPermission] = useCameraPermissions();

  const handleBarcodeScan = ({ type, data }) => {
    setScanned(true);
    setShowScanner(false);
    
    // Try to find a matching product by ItemCode
    const scannedCode = data.trim();
    const matchedProduct = products.find(
      (p) => String(p.ItemCode).trim().toLowerCase() === scannedCode.toLowerCase()
    );

    if (matchedProduct) {
      setSelectedProduct(matchedProduct);
      setRate(String(matchedProduct.Rate || ''));
    } else {
      Alert.alert('No Match', `No product found for scanned code: "${scannedCode}". Please check the barcode or select manually.`);
    }
  };

  const openScanner = () => {
    if (!permission) {
      Alert.alert('Loading', 'Camera permissions are still loading...');
      return;
    }
    if (!permission.granted) {
      requestPermission().then((result) => {
        if (result.granted) {
          setScanned(false);
          setShowScanner(true);
        } else {
          Alert.alert('Permission Required', 'Camera permission is needed to scan barcodes.');
        }
      });
      return;
    }
    setScanned(false);
    setShowScanner(true);
  };

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    if (isEditMode && editOrder) {
      // 1. Basic pre-population (Transport, Notes)
      setOrderNo(String(editOrder.OrderID));
      setTransport(editOrder.Transport || "");
      setNotes(editOrder.Sp_Note || editOrder.SpNote || editOrder.Notes || ""); 
      
      // 2. Set Party
      if (editOrder.CustomerName) {
        setSelectedParty({
          PartyName: editOrder.CustomerName,
          PartyID: editOrder.client_code,
          ac_name: editOrder.CustomerName,
          ac_code: editOrder.client_code
        });
      }
      
      // 3. Set Salesman (Try multiple sources)
      const sName = editOrder.SalesmanName || editOrder.salesmanName || editOrder.broker_name;
      const sCode = editOrder.SalesmanCode || editOrder.salesmanCode || editOrder.brokerCode || editOrder.Broker_code || editOrder.Broker_Code;
      
      if (sName && sName !== 'Missing Name' && sName !== 'null') {
        setSelectedSalesman({
          ac_name: sName,
          ac_code: sCode || "",
          SalesmanID: sCode || ""
        });
      } else if (sCode && salesmenData.length > 0) {
        // RECOVERY: If name is missing but we have a code, find it in the list!
        const found = salesmenData.find(s => 
          String(s.ac_code).trim().toLowerCase() === String(sCode).trim().toLowerCase()
        );
        if (found) {
          setSelectedSalesman(found);
        }
      }
    }
  }, [editOrder, salesmenData]);

  // Match selected party once parties are loaded
  useEffect(() => {
    if (isEditMode && editOrder && parties.length > 0) {
      const matchedParty = parties.find(p => 
        (editOrder.client_code && (p.PartyID === editOrder.client_code || p.ac_code === editOrder.client_code)) || 
        (p.PartyName === editOrder.CustomerName || p.ac_name === editOrder.CustomerName)
      );
      if (matchedParty) setSelectedParty(matchedParty);
    }
  }, [parties, editOrder]);

  // Match selected salesman once salesmen are loaded
  useEffect(() => {
    if (isEditMode && editOrder && salesmenData.length > 0) {
      const searchCode = String(editOrder.SalesmanCode || "").trim();
      const searchName = String(editOrder.SalesmanName || "").trim();

      const matchedSalesman = salesmenData.find(s => {
        const itemCode = String(s.ac_code || "").trim();
        const itemName = String(s.ac_name || "").trim();
        return (searchCode && itemCode === searchCode) || 
               (searchName && itemName === searchName);
      });

      if (matchedSalesman) {
        setSelectedSalesman(matchedSalesman);
      } else if (editOrder.SalesmanName || editOrder.SalesmanCode) {
        // Fallback: Use the data directly from editOrder if not found in the full list
        setSelectedSalesman({
          ac_name: editOrder.SalesmanName || editOrder.SalesmanCode || "Selected Salesman",
          ac_code: editOrder.SalesmanCode || "",
          isFallback: true
        });
      }
    }
  }, [salesmenData, editOrder]);

  useEffect(() => {
    if (isEditMode && editOrder && editOrder.products) {
      const mappedProducts = editOrder.products.map(p => ({
        productName: p.ProductName,
        itemCode: p.ItemCode,
        qty: String(p.Quantity),
        unit: p.Unit || "",
        rate: String(p.UnitPrice),
        discount: String(p.Discount || 0),
        discountPercent: String(p.DiscountPercent || 0),
        amount: String(p.TotalPrice || (parseFloat(p.Quantity || 0) * parseFloat(p.UnitPrice || 0)) || "0"),
        remark: p.Description || p.remark || "",
        imagePath: null,
      }));
      setProductsList(mappedProducts);
    }
  }, [editOrder]);

  const loadData = async () => {
    try {
      const [pData, prodData, sData] = await Promise.all([
        fetchParties(), 
        fetchProducts(),
        fetchSalesmen()
      ]);
      setParties(pData.data || []);
      setProducts(prodData.data || []);
      setSalesmenData(sData.data || []);
    } catch (err) {
      console.error("Failed to load dropdown data", err);
    }
  };

  const calculateAmount = () => {
    const q = parseFloat(qty || 0);
    const r = parseFloat(rate || 0);
    const dPercent = parseFloat(discountPercent || 0);
    const gross = q * r;
    const result = gross - (gross * (dPercent / 100));
    return isNaN(result) ? "0.00" : result.toFixed(2);
  };

  const calculateTotal = () => {
    return productsList.reduce((sum, p) => sum + parseFloat(p.amount || 0), 0).toFixed(2);
  };

  const handleAddProduct = () => {
    if (!selectedProduct || !qty || parseFloat(qty) <= 0) {
      Alert.alert("Validation Error", "Please select a product and enter a valid quantity.");
      return;
    }

    const currentAmount = calculateAmount();
    const q = parseFloat(qty || 0);
    const dPercent = parseFloat(discountPercent || 0);
    const r = parseFloat(rate || 0);
    const discAmt = isNaN(q * r * dPercent) ? 0 : (q * r) * (dPercent / 100);

    const newProduct = {
      productName: selectedProduct.ProductName,
      itemCode: selectedProduct.ItemCode,
      qty: qty,
      unit: selectedProduct.Unit || "",
      rate: rate,
      discount: isNaN(discAmt) ? "0.00" : discAmt.toFixed(2),
      discountPercent: discountPercent,
      amount: currentAmount,
      remark: remark,
      imagePath: selectedProduct.ImagePath,
    };

    setProductsList([...productsList, newProduct]);
    setSelectedProduct(null);
    setQty("");
    setRate("");
    setDiscountPercent("0");
    setRemark("");
  };

  const handleRemoveProduct = (index) => {
    const updated = [...productsList];
    updated.splice(index, 1);
    setProductsList(updated);
  };

  const handleEditProduct = (index) => {
    const item = productsList[index];
    setSelectedProduct({
      ProductName: item.productName,
      ItemCode: item.itemCode,
      Unit: item.unit,
      ImagePath: item.imagePath,
    });
    setQty(item.qty);
    setRate(item.rate);
    setDiscountPercent(item.discountPercent);
    setRemark(item.remark || "");

    // Remove from list so they can re-add it updated
    handleRemoveProduct(index);
  };

  const handleConfirmOrder = async () => {
    const finalPartyId = selectedParty?.ac_code || selectedParty?.PartyID || editOrder?.client_code;
    const finalCustomerName = selectedParty?.ac_name || selectedParty?.PartyName || editOrder?.CustomerName;

    if (!finalPartyId || productsList.length === 0) {
      Alert.alert("Error", "Please select a party and add at least one product.");
      return;
    }

    setLoading(true);
    try {
      const finalProducts = productsList.map(p => ({
        productName: p.productName,
        itemCode: p.itemCode,
        quantity: parseInt(p.qty),
        unitPrice: parseFloat(p.rate),
        discount: parseFloat(p.discount),
        discountPercent: parseFloat(p.discountPercent),
        remark: p.remark || ""
      }));

      const payload = {
        partyId: finalPartyId,
        customerName: finalCustomerName,
        orderDate: editOrder?.OrderDate || new Date().toISOString(),
        transport: transport,
        notes: notes,
        salesmanId: selectedSalesman?.ac_code || selectedSalesman?.SalesmanID || editOrder?.SalesmanCode || "",
        salesman: selectedSalesman?.ac_name || selectedSalesman?.SalesmanName || "",
        flag: flag,
        adjustment: adjustment,
        adjustmentValue: adjustmentValue,
        totalAmount: parseFloat(calculateTotal()) || 0,
        products: finalProducts,
      };

      const res = isEditMode 
        ? await updateOrder(editOrder.OrderID, payload)
        : await createOrder(payload);

      if (res.success) {
        Alert.alert("Success", `Order ${isEditMode ? 'updated' : 'created'} successfully!`, [
          { text: "OK", onPress: () => navigation.replace("Dashboard") }
        ]);
      }
    } catch (err) {
      console.error('Order confirm error:', err?.response?.data || err.message || err);
      const msg = err?.response?.data?.message || err.message || 'Unknown error';
      Alert.alert("Error", "Failed to confirm order: " + msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar backgroundColor="#0056b3" barStyle="light-content" />

      <View style={styles.header}>
        <TouchableOpacity style={styles.headerBack} onPress={() => navigation.goBack()}>
          <Icon name="back" size={22} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{isEditMode ? "Edit Order" : "Create Order"}</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <SectionCard>
          <View style={styles.sectionHeader}>
            <Icon name="order" size={16} color="#0056b3" />
            <Text style={styles.sectionTitle}>Order Details</Text>
          </View>

          <View style={styles.row}>
            <View style={styles.halfCol}>
              <FieldLabel label="ORDER NUMBER" />
              <InputField placeholder="ORD-2024-001" value={orderNo} editable={false} />
            </View>
            <View style={styles.halfCol}>
              <FieldLabel label="ORDER DATE" />
              <InputField
                placeholder="2024-05-20"
                value={new Date().toISOString().split('T')[0]}
                editable={false}
              />
            </View>
          </View>

          <FieldLabel label="Party" />
          <TouchableOpacity style={styles.dropdown} activeOpacity={0.8} onPress={() => setShowPartyModal(true)}>
            <Text style={selectedParty ? styles.dropdownValue : styles.dropdownPlaceholder}>
              {selectedParty ? selectedParty.PartyName : "Select a Party"}
            </Text>
            <Icon name="chevron" size={16} color="#90a4ae" />
          </TouchableOpacity>

          <FieldLabel label="CATEGORY" />
          <View style={styles.categoryBadge}>
            <Text style={styles.categoryText}>{selectedParty?.Category || "Select a party above"}</Text>
          </View>

          <FieldLabel label="Transport" />
          <InputField placeholder="Enter transport details" value={transport} onChangeText={setTransport} />

          <FieldLabel label="Special Notes" />
          <InputField
            placeholder="Additional instructions..."
            value={notes}
            onChangeText={setNotes}
            multiline
            numberOfLines={3}
          />

          <FieldLabel label="Salesman" />
          <TouchableOpacity style={styles.dropdown} activeOpacity={0.8} onPress={() => setShowSalesmanModal(true)}>
            <Text style={selectedSalesman ? styles.dropdownValue : styles.dropdownPlaceholder}>
              {selectedSalesman ? selectedSalesman.ac_name : "Select Salesman"}
            </Text>
            <Icon name="chevron" size={16} color="#90a4ae" />
          </TouchableOpacity>

          <FieldLabel label="INTERNAL FLAGS & ADJUSTMENT" />
          <View style={styles.flagsRow}>
            <RadioGroup options={["1", "2", "3"]} selected={flag} onSelect={setFlag} />
            <TouchableOpacity 
              style={styles.adjDropdownSmall} 
              activeOpacity={0.8}
              onPress={() => setShowAdjModal(true)}
            >
              <Text style={styles.dropdownValue}>{adjustment}</Text>
              <Icon name="chevron" size={14} color="#90a4ae" />
            </TouchableOpacity>
            <TextInput
              style={styles.adjInput}
              value={adjustmentValue}
              onChangeText={setAdjustmentValue}
              keyboardType="numeric"
              placeholder="0.00"
              placeholderTextColor="#b0bec5"
            />
          </View>
        </SectionCard>

        {productsList.length > 0 && (
          <SectionCard style={{ marginTop: 12 }}>
            <Text style={styles.sectionTitle}>Items Details ({productsList.length})</Text>
            {productsList.map((item, idx) => (
              <View key={idx} style={{ backgroundColor: '#fafcff', borderWidth: 1, borderColor: '#e0e7ef', borderRadius: 10, padding: 12, marginTop: 10 }}>
                {/* Row 1: Name and Total */}
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 }}>
                  <Text style={{ flex: 1, fontSize: 14, fontWeight: '700', color: '#0056b3', paddingRight: 10 }} numberOfLines={2}>
                    {item.productName}
                  </Text>
                  <Text style={{ fontSize: 14, fontWeight: '800', color: '#1565C0' }}>
                    ₹{parseFloat(item.amount).toFixed(2)}
                  </Text>
                </View>
                
                {/* Row 2: Qty/Rate and Discount */}
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Text style={{ fontSize: 12, color: '#78909c', fontWeight: '500' }}>
                    {item.qty} {item.unit} @ ₹{item.rate}
                  </Text>
                  {parseFloat(item.discountPercent) > 0 && (
                    <View style={{ backgroundColor: '#e8f5e9', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 }}>
                      <Text style={{ fontSize: 11, color: '#2e7d32', fontWeight: '700' }}>
                        -{item.discountPercent}% (₹{parseFloat(item.discount || 0).toFixed(2)})
                      </Text>
                    </View>
                  )}
                </View>

                {/* Row 3: Remark */}
                {!!item.remark && (
                  <View style={{ marginTop: 6, backgroundColor: '#fffde7', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4 }}>
                    <Text style={{ fontSize: 11, color: '#6d4c41', fontStyle: 'italic' }}>📝 {item.remark}</Text>
                  </View>
                )}

                {/* Row 4: Divider and Actions */}
                <View style={{ flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: '#f0f2f5', gap: 10 }}>
                  <TouchableOpacity onPress={() => handleEditProduct(idx)} style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff3e0', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 6 }}>
                    <Text style={{ fontSize: 12, color: '#e65100', fontWeight: 'bold' }}>✏️ Edit</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => handleRemoveProduct(idx)} style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#ffebee', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 6 }}>
                    <Text style={{ fontSize: 12, color: '#c62828', fontWeight: 'bold' }}>🗑️ Delete</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))}
          </SectionCard>
        )}

        <SectionCard style={{ marginTop: 12 }}>
          <View style={styles.sectionHeader}>
            <Icon name="product" size={16} color="#0056b3" />
            <Text style={styles.sectionTitle}>Product Details</Text>
            <TouchableOpacity style={[styles.scanBtn, { padding: 6 }]} onPress={openScanner}>
              <Image source={require('../../assets/icons/qrrcode.png')} style={{ width: 26, height: 26, tintColor: '#222' }} resizeMode="contain" />
            </TouchableOpacity>
          </View>

          <View style={styles.row}>
            <View style={styles.halfCol}>
              <FieldLabel label="Item Code" />
              <TouchableOpacity style={styles.dropdown} onPress={() => setShowProductModal(true)}>
                <Text style={selectedProduct ? styles.dropdownValue : styles.dropdownPlaceholder}>
                  {selectedProduct ? selectedProduct.ItemCode : "Select Code"}
                </Text>
                <Icon name="chevron" size={16} color="#90a4ae" />
              </TouchableOpacity>
            </View>
            <View style={styles.halfCol}>
              <FieldLabel label="STOCK LEFT" />
              <View style={styles.stockBadge}>
                <Text style={styles.stockText}>{selectedProduct?.StockQty || "0"}</Text>
              </View>
            </View>
          </View>

          <FieldLabel label="PRODUCT NAME" />
          <View style={styles.productRow}>
            <TextInput
              style={[styles.input, { flex: 1, marginRight: 10 }]}
              value={selectedProduct?.ProductName || "Select a product"}
              editable={false}
              placeholderTextColor="#b0bec5"
            />
            <View style={styles.productThumb}>
              {selectedProduct?.ImagePath ? (
                <Image source={{ uri: selectedProduct.ImagePath }} style={styles.productImage} />
              ) : (
                <View style={styles.productImagePlaceholder}><Text style={{ fontSize: 24 }}>🔩</Text></View>
              )}
            </View>
          </View>

          <FieldLabel label="UNITS" />
          <View style={styles.unitBadge}><Text style={styles.unitText}>{selectedProduct?.Unit || "N/A"}</Text></View>

          <View style={styles.row}>
            <View style={styles.halfCol}>
              <FieldLabel label="Quantity" />
              <TextInput style={styles.input} value={qty} onChangeText={setQty} keyboardType="numeric" placeholder="0.00" />
            </View>
            <View style={styles.halfCol}>
              <FieldLabel label="Rate" />
              <TextInput style={styles.input} value={rate} onChangeText={setRate} keyboardType="numeric" placeholder="0.00" />
            </View>
          </View>

          <View style={styles.row}>
            <View style={styles.halfCol}>
              <FieldLabel label="Discount (%)" />
              <TextInput 
                style={[styles.input, selectedParty?.Category === 'A' && { backgroundColor: '#f1f5f9', color: '#94a3b8' }]} 
                value={discountPercent} 
                onChangeText={setDiscountPercent} 
                keyboardType="numeric" 
                placeholder="0" 
                editable={selectedParty?.Category !== 'A'}
              />
            </View>
            <View style={styles.halfCol}>
              <FieldLabel label="Amount" />
              <TextInput style={[styles.input, { backgroundColor: '#e8f5e9' }]} value={calculateAmount()} editable={false} />
            </View>
          </View>

          <FieldLabel label="PRODUCT REMARK" />
          <TextInput
            style={[styles.input, { height: 70, textAlignVertical: 'top', paddingTop: 10 }]}
            placeholder="Type any remarks for this product..."
            value={remark}
            onChangeText={setRemark}
            multiline={true}
            numberOfLines={3}
          />

          <TouchableOpacity style={styles.addProductBtn} onPress={handleAddProduct}>
            <Icon name="plus" size={16} color="#1565C0" />
            <Text style={styles.addProductText}>Add Product</Text>
          </TouchableOpacity>
        </SectionCard>

        {/* The productsList mapping was moved higher up. */}
        <TouchableOpacity style={styles.confirmBtn} onPress={handleConfirmOrder}>
          <Icon name="confirm" size={16} color="#fff" />
          <Text style={styles.confirmText}>{isEditMode ? "UPDATE ORDER" : "CONFIRM ORDER"}</Text>
        </TouchableOpacity>

        <View style={{ height: 20 }} />
      </ScrollView>

      <View style={styles.tabBar}>
        <TouchableOpacity style={styles.tabItem} onPress={() => navigation.navigate("Dashboard")}>
          <Icon name="home" size={20} color="#90a4ae" />
          <Text style={styles.tabLabel}>Home</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.tabItem} onPress={() => {}}>
          <Icon name="list" size={20} color="#0056b3" />
          <Text style={[styles.tabLabel, { color: "#0056b3" }]}>Create Order</Text>
        </TouchableOpacity>
      </View>

      <SearchableDropdown 
        visible={showPartyModal}
        data={parties}
        title="Select Party"
        placeholder="Search Party Name..."
        onSelect={(p) => { 
          setSelectedParty(p); 
          setShowPartyModal(false); 
          
          // Auto-fill transport detail from the party's database record
          if (p.Transport) {
            setTransport(p.Transport);
          } else {
            setTransport(""); // Clear if no transport found
          }

          if (p.Category === 'A') {
            setDiscountPercent("0");
          } else if (p.Category === 'B') {
            setDiscountPercent(String(p.discper || 0));
          }
        }}
        onClose={() => setShowPartyModal(false)}
      />

      <SearchableDropdown 
        visible={showProductModal}
        data={products}
        title="Select Item Code"
        placeholder="Search by code or product name..."
        isProduct={true}
        onSelect={(p) => { setSelectedProduct(p); setRate((p.Rate || 0).toString()); setShowProductModal(false); }}
        onClose={() => setShowProductModal(false)}
      />

      <SearchableDropdown 
        visible={showSalesmanModal}
        data={salesmenData}
        title="Select Salesman"
        placeholder="Search Salesman..."
        hideCode={true}
        onSelect={(s) => { setSelectedSalesman(s); setShowSalesmanModal(false); }}
        onClose={() => setShowSalesmanModal(false)}
      />

      <Modal visible={showAdjModal} transparent animationType="fade">
        <TouchableOpacity style={styles.modalOverlay} onPress={() => setShowAdjModal(false)}>
           <View style={styles.tinyModal}>
              {["R", "M"].map(opt => (
                <TouchableOpacity key={opt} style={styles.adjItem} onPress={() => { setAdjustment(opt); setShowAdjModal(false); }}>
                  <Text style={styles.adjItemText}>{opt}</Text>
                </TouchableOpacity>
              ))}
           </View>
        </TouchableOpacity>
      </Modal>

      {/* QR / Barcode Scanner Modal */}
      <Modal visible={showScanner} animationType="slide" onRequestClose={() => setShowScanner(false)}>
        <View style={scannerStyles.container}>
          <CameraView
            style={StyleSheet.absoluteFillObject}
            onBarcodeScanned={scanned ? undefined : handleBarcodeScan}
            barcodeScannerSettings={{
              barcodeTypes: ['qr', 'ean13', 'ean8', 'code128', 'code39', 'code93', 'upc_a', 'upc_e', 'itf14', 'codabar', 'datamatrix', 'pdf417', 'aztec'],
            }}
          />
          {/* Scanner Overlay */}
          <View style={scannerStyles.overlay}>
            <SafeAreaView style={scannerStyles.topBar}>
              <TouchableOpacity onPress={() => setShowScanner(false)} style={scannerStyles.closeBtn}>
                <Text style={scannerStyles.closeBtnText}>✕ Close</Text>
              </TouchableOpacity>
            </SafeAreaView>
            <View style={scannerStyles.middle}>
              <View style={scannerStyles.frame}>
                <View style={[scannerStyles.corner, scannerStyles.tl]} />
                <View style={[scannerStyles.corner, scannerStyles.tr]} />
                <View style={[scannerStyles.corner, scannerStyles.bl]} />
                <View style={[scannerStyles.corner, scannerStyles.br]} />
              </View>
            </View>
            <View style={scannerStyles.bottomBar}>
              <Text style={scannerStyles.instructionText}>Point the camera at a product barcode</Text>
            </View>
          </View>
        </View>
      </Modal>

      {loading && (
        <View style={styles.loadingOverlay}><ActivityIndicator size="large" color="#1565C0" /></View>
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
    height: Platform.OS === 'ios' ? 100 : 60 + (StatusBar.currentHeight || 0),
    paddingTop: Platform.OS === 'ios' ? 40 : (StatusBar.currentHeight || 0),
    elevation: 4,
  },
  headerBack: { marginRight: 8, padding: 4 },
  headerTitle: { flex: 1, color: "#fff", fontSize: 17, fontWeight: "700" },
  scroll: { flex: 1 },
  scrollContent: { padding: 12, paddingBottom: 24 },
  card: { backgroundColor: "#fff", borderRadius: 14, padding: 16, elevation: 2, marginBottom: 10 },
  sectionHeader: { flexDirection: "row", alignItems: "center", marginBottom: 14 },
  sectionTitle: { flex: 1, fontSize: 15, fontWeight: "700", color: "#0056b3", marginLeft: 6 },
  scanBtn: { padding: 4 },
  row: { flexDirection: "row", gap: 10 },
  halfCol: { flex: 1 },
  fieldLabel: { fontSize: 10, fontWeight: "700", color: "#78909c", letterSpacing: 0.8, marginBottom: 5, marginTop: 10, textTransform: "uppercase" },
  input: { borderWidth: 1.5, borderColor: "#e0e7ef", borderRadius: 9, paddingHorizontal: 12, fontSize: 13, color: "#263238", backgroundColor: "#fafcff", height: 44 },
  dropdown: { borderWidth: 1.5, borderColor: "#e0e7ef", borderRadius: 9, paddingHorizontal: 12, flexDirection: "row", alignItems: "center", backgroundColor: "#fafcff", height: 44 },
  dropdownPlaceholder: { flex: 1, fontSize: 13, color: "#b0bec5" },
  dropdownValue: { flex: 1, fontSize: 13, color: "#263238" },
  categoryBadge: { backgroundColor: "#e8eaf6", borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, alignSelf: "flex-start", marginTop: 4 },
  categoryText: { color: "#0056b3", fontWeight: "700", fontSize: 12 },
  radioRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  flagsRow: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 6 },
  radioItem: { flexDirection: "row", alignItems: "center", gap: 5 },
  radioCircle: { width: 18, height: 18, borderRadius: 9, borderWidth: 2, borderColor: "#90a4ae", alignItems: "center", justifyContent: "center" },
  radioCircleActive: { borderColor: "#0056b3" },
  radioDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: "#0056b3" },
  radioLabel: { fontSize: 13, color: "#455a64", fontWeight: "600" },
  adjDropdownSmall: { width: 60, borderWidth: 1.5, borderColor: "#e0e7ef", borderRadius: 8, flexDirection: "row", alignItems: "center", backgroundColor: "#fafcff", paddingHorizontal: 6, height: 44 },
  adjInput: { flex: 1, borderWidth: 1.5, borderColor: "#e0e7ef", borderRadius: 8, paddingHorizontal: 10, fontSize: 13, color: "#263238", backgroundColor: "#fafcff", height: 44 },
  stockBadge: { borderWidth: 1.5, borderColor: "#e0e7ef", borderRadius: 9, paddingHorizontal: 12, backgroundColor: "#fafcff", height: 44, justifyContent: 'center' },
  stockText: { fontSize: 13, fontWeight: "700", color: "#263238" },
  productRow: { flexDirection: "row", alignItems: "center", marginTop: 0 },
  productThumb: { width: 60, height: 60, borderRadius: 10, overflow: "hidden", borderWidth: 1.5, borderColor: "#e0e7ef", backgroundColor: "#f0f2f5", alignItems: "center", justifyContent: "center" },
  productImage: { width: '100%', height: '100%' },
  productImagePlaceholder: { alignItems: "center", justifyContent: "center", width: "100%", height: "100%" },
  unitBadge: { backgroundColor: "#e8eaf6", borderRadius: 7, paddingHorizontal: 12, paddingVertical: 6, alignSelf: "flex-start", marginTop: 4 },
  unitText: { color: "#0056b3", fontWeight: "700", fontSize: 12 },
  addProductBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: "#0056b3", borderStyle: "dashed", borderRadius: 10, paddingVertical: 12, marginTop: 16 },
  addProductText: { color: "#0056b3", fontWeight: "700", fontSize: 14 },
  confirmBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", backgroundColor: "#0056b3", borderRadius: 12, paddingVertical: 15, marginTop: 10 },
  confirmText: { color: "#fff", fontWeight: "800", fontSize: 15 },
  tabBar: { flexDirection: "row", backgroundColor: "#fff", borderTopWidth: 1, borderTopColor: "#e0e7ef", paddingVertical: 10 },
  tabItem: { flex: 1, alignItems: "center" },
  tabLabel: { fontSize: 11, color: "#90a4ae", fontWeight: "600", marginTop: 4 },
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "center", padding: 20 },
  modalContent: { backgroundColor: "#fff", borderRadius: 20, height: "80%", padding: 20 },
  modalHeader: { flexDirection: "row", justifyContent: "space-between", marginBottom: 20 },
  searchBar: { flexDirection: "row", alignItems: "center", backgroundColor: "#f5f7fa", borderRadius: 10, paddingHorizontal: 10, height: 44, marginBottom: 15 },
  searchInput: { flex: 1, marginLeft: 10, fontSize: 14 },
  listItem: { paddingVertical: 15, borderBottomWidth: 1, borderBottomColor: "#f0f2f5" },
  listItemGrid: { flexDirection: 'row', alignItems: 'center' },
  miniThumb: { width: 40, height: 40, borderRadius: 6, marginRight: 12 },
  listItemText: { fontSize: 15, color: "#333", fontWeight: "500" },
  listItemSubRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 },
  listItemSubText: { fontSize: 12, color: "#95a5a6" },
  listItemStock: { fontSize: 12, color: "#0056b3", fontWeight: '600' },
  loadingOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(255,255,255,0.7)', justifyContent: 'center', alignItems: 'center', zIndex: 1000 },
  listItemAdded: { flexDirection: 'row', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#f0f2f5', alignItems: 'center' },
  pName: { fontSize: 14, fontWeight: 'bold', color: '#263238' },
  pSub: { fontSize: 12, color: '#78909c', marginTop: 2 },
  alignEnd: { alignItems: 'flex-end' },
  pAmount: { fontSize: 14, fontWeight: 'bold', color: '#0056b3' },
  pDisc: { fontSize: 11, color: '#4caf50', fontWeight: '600' },
  itemActions: { flexDirection: 'row', marginLeft: 15, gap: 8 },
  actionIcon: { padding: 6, backgroundColor: '#f5f7fa', borderRadius: 6 },
  tinyModal: { backgroundColor: '#fff', width: 100, borderRadius: 10, padding: 5, alignSelf: 'center' },
  adjItem: { padding: 15, borderBottomWidth: 1, borderBottomColor: '#eee', alignItems: 'center' },
  adjItemText: { fontSize: 16, fontWeight: '600', color: '#333' }
});

const SCREEN_WIDTH = Dimensions.get('window').width;
const FRAME_SIZE = SCREEN_WIDTH * 0.65;

const scannerStyles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  overlay: { ...StyleSheet.absoluteFillObject, justifyContent: 'space-between' },
  topBar: { backgroundColor: 'rgba(0,0,0,0.6)', paddingHorizontal: 20, paddingTop: Platform.OS === 'ios' ? 0 : (StatusBar.currentHeight || 0), paddingBottom: 15 },
  closeBtn: { alignSelf: 'flex-start', backgroundColor: 'rgba(255,255,255,0.2)', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 20, marginTop: 10 },
  closeBtnText: { color: '#fff', fontWeight: 'bold', fontSize: 15 },
  middle: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  frame: { width: FRAME_SIZE, height: FRAME_SIZE, position: 'relative' },
  corner: { position: 'absolute', width: 30, height: 30, borderColor: '#0056b3' },
  tl: { top: 0, left: 0, borderTopWidth: 4, borderLeftWidth: 4, borderTopLeftRadius: 8 },
  tr: { top: 0, right: 0, borderTopWidth: 4, borderRightWidth: 4, borderTopRightRadius: 8 },
  bl: { bottom: 0, left: 0, borderBottomWidth: 4, borderLeftWidth: 4, borderBottomLeftRadius: 8 },
  br: { bottom: 0, right: 0, borderBottomWidth: 4, borderRightWidth: 4, borderBottomRightRadius: 8 },
  bottomBar: { backgroundColor: 'rgba(0,0,0,0.6)', paddingVertical: 30, alignItems: 'center' },
  instructionText: { color: '#fff', fontSize: 15, fontWeight: '600', textAlign: 'center' },
});
