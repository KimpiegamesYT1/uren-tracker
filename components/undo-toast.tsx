import React, { useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useAppColors } from '@/hooks/use-app-colors';

interface UndoToastProps {
  visible: boolean;
  message: string;
  onUndo: () => void;
  onDismiss: () => void;
  durationMs?: number;
}

export function UndoToast({ visible, message, onUndo, onDismiss, durationMs = 5000 }: UndoToastProps) {
  const { colors } = useAppColors();
  const styles = getStyles(colors);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (visible) {
      timerRef.current = setTimeout(() => {
        onDismiss();
      }, durationMs);
    }
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [visible, durationMs, onDismiss]);

  if (!visible) return null;

  const handleUndo = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    onUndo();
  };

  return (
    <View style={styles.container} accessibilityLiveRegion="polite">
      <Text style={styles.message}>{message}</Text>
      <TouchableOpacity
        onPress={handleUndo}
        accessibilityLabel="Ongedaan maken"
        accessibilityRole="button">
        <Text style={styles.undoButton}>Ongedaan maken</Text>
      </TouchableOpacity>
    </View>
  );
}

function getStyles(colors: ReturnType<typeof useAppColors>['colors']) {
  return StyleSheet.create({
    container: {
      position: 'absolute',
      bottom: 24,
      left: 16,
      right: 16,
      backgroundColor: colors.surfaceElevated,
      borderRadius: 10,
      padding: 16,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.25,
      shadowRadius: 6,
      elevation: 6,
      zIndex: 999,
    },
    message: {
      color: colors.textPrimary,
      fontSize: 14,
      flex: 1,
    },
    undoButton: {
      color: colors.accentSecondary,
      fontWeight: '700',
      fontSize: 14,
      marginLeft: 12,
    },
  });
}
