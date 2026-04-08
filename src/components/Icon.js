import React from 'react';
import { Text } from 'react-native';

const Icon = ({ name, size = 18, color = "#fff" }) => {
  const map = {
    back: "‹",
    order: "📋",
    party: "👤",
    transport: "🚚",
    notes: "📝",
    salesman: "🧑💼",
    product: "📦",
    scan: "⊞",
    confirm: "✓",
    home: "🏠",
    list: "☰",
    chevron: "›",
    plus: "+",
    search: "🔍",
    reports: "📊",
  };
  return (
    <Text style={{ fontSize: size, color, lineHeight: size + 4 }}>
      {map[name] ?? "•"}
    </Text>
  );
};

export default Icon;
