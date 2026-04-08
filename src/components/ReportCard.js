import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';

/**
 * ReportCard Component
 * Props:
 *   title      - Card title (e.g. "Report 1")
 *   value      - The count/data to display
 *   subtitle   - Label below the value
 *   color      - Card accent color
 *   loading    - Show loading spinner
 *   error      - Show error message
 */
export default function ReportCard({ title, value, subtitle, color = '#1a237e', loading, error }) {
  return (
    <View style={[styles.card, { borderTopColor: color }]}>
      <Text style={styles.title}>{title}</Text>
      <View style={styles.valueContainer}>
        {loading ? (
          <ActivityIndicator color={color} size="large" />
        ) : error ? (
          <Text style={styles.error}>Error loading</Text>
        ) : (
          <>
            <Text style={[styles.value, { color }]}>{value ?? '—'}</Text>
            {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
          </>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 18,
    margin: 8,
    flex: 1,
    borderTopWidth: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 6,
    elevation: 4,
    minHeight: 120,
    justifyContent: 'space-between',
  },
  title: {
    fontSize: 13,
    color: '#666',
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  valueContainer: {
    marginTop: 10,
    alignItems: 'flex-start',
  },
  value: {
    fontSize: 34,
    fontWeight: 'bold',
    lineHeight: 40,
  },
  subtitle: {
    fontSize: 12,
    color: '#888',
    marginTop: 4,
  },
  error: {
    fontSize: 13,
    color: '#e53935',
  },
});
