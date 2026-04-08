import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';

import LoginScreen from '../screens/LoginScreen';
import DashboardScreen from '../screens/DashboardScreen';
import CreateOrderScreen from '../screens/CreateOrderScreen';
import PendingReportScreen from '../screens/PendingReportScreen';

const Stack = createStackNavigator();

export default function AppNavigator() {
  return (
    <NavigationContainer>
      <Stack.Navigator
        initialRouteName="Login"
        screenOptions={{
          headerStyle: { backgroundColor: '#0056b3' },
          headerTintColor: '#fff',
          headerTitleStyle: { fontWeight: 'bold', fontSize: 18 },
          cardStyle: { backgroundColor: '#f0f4ff' },
        }}
      >
        <Stack.Screen
          name="Login"
          component={LoginScreen}
          options={{ headerShown: false }} // Login page has no header
        />
        <Stack.Screen
          name="Dashboard"
          component={DashboardScreen}
          options={({ navigation }) => ({
            title: 'Dashboard',
            headerLeft: null, // Prevent going back to login
          })}
        />
        <Stack.Screen
          name="CreateOrder"
          component={CreateOrderScreen}
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="PendingReport"
          component={PendingReportScreen}
          options={{ headerShown: false }}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
