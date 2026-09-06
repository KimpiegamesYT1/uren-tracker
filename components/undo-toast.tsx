import React, { useEffect } from 'react';
import { Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeInDown, FadeOutDown } from 'react-native-reanimated';
import { useAppColors } from '@/hooks/use-app-colors';
import { useAppStore } from '@/store/use-app-store';

const AUTO_DISMISS_MS = 5000;
// Enough to clear the bottom tab bar when the toast lands on a tab screen.
const BOTTOM_CLEARANCE = 68;

/**
 * The single undo toast for the whole app. Rendered once at the app root so a
 * screen can trigger it and immediately navigate away — e.g. deleting a shift
 * closes its edit screen and the "Ongedaan maken" prompt appears on the list.
 */
export function GlobalUndoToast() {
  const undo = useAppStore((s) => s.undo);
  const hideUndo = useAppStore((s) => s.hideUndo);
  const bumpRevision = useAppStore((s) => s.bumpRevision);
  const { colors } = useAppColors();
  const insets = useSafeAreaInsets();
  const styles = getStyles(colors);

  useEffect(() => {
    if (!undo) return;
    const timer = setTimeout(hideUndo, AUTO_DISMISS_MS);
    return () => clearTimeout(timer);
  }, [undo, hideUndo]);

  if (!undo) return null;

  return (
    <Animated.View
      entering={FadeInDown.duration(220)}
      exiting={FadeOutDown.duration(180)}
      style={[styles.container, { bottom: Math.max(insets.bottom, 12) + BOTTOM_CLEARANCE }]}
      accessibilityLiveRegion="polite">
      <Text style={styles.message}>{undo.message}</Text>
      <TouchableOpacity
        onPress={() => {
          undo.onUndo();
          hideUndo();
          bumpRevision();
        }}
        accessibilityLabel="Ongedaan maken"
        accessibilityRole="button">
        <Text style={styles.undoButton}>Ongedaan maken</Text>
      </TouchableOpacity>
    </Animated.View>
  );
}

function getStyles(colors: ReturnType<typeof useAppColors>['colors']) {
  return StyleSheet.create({
    container: {
      position: 'absolute',
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
