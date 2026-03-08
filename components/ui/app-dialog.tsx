import React, { useState } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';

import { useAppColors } from '@/hooks/use-app-colors';

export type DialogButton = {
  text: string;
  style?: 'cancel' | 'destructive' | 'default';
  onPress?: () => void;
};

export type DialogConfig = {
  title: string;
  message?: string;
  buttons?: DialogButton[];
};

type AppDialogProps = {
  config: DialogConfig | null;
  onDismiss: () => void;
};

export function AppDialog({ config, onDismiss }: AppDialogProps) {
  const { colors } = useAppColors();
  const styles = getStyles(colors);

  const buttons: DialogButton[] =
    config?.buttons && config.buttons.length > 0
      ? config.buttons
      : [{ text: 'OK', style: 'default' }];

  return (
    <Modal visible={config !== null} transparent animationType="fade" onRequestClose={onDismiss}>
      <View style={styles.overlay}>
        <View style={styles.card}>
          {config && (
            <>
              <Text style={styles.title}>{config.title}</Text>
              {config.message ? (
                <Text style={styles.message}>{config.message}</Text>
              ) : null}
              <View style={styles.buttonRow}>
                {buttons.map((btn, i) => (
                  <TouchableOpacity
                    key={i}
                    style={[styles.btn, btnBg(styles, btn.style)]}
                    onPress={() => {
                      onDismiss();
                      btn.onPress?.();
                    }}>
                    <Text style={[styles.btnText, btnTextStyle(styles, btn.style)]}>
                      {btn.text}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </>
          )}
        </View>
      </View>
    </Modal>
  );
}

function btnBg(
  styles: ReturnType<typeof getStyles>,
  style?: DialogButton['style']
): object {
  if (style === 'cancel') return styles.btnCancel;
  if (style === 'destructive') return styles.btnDestructive;
  return styles.btnDefault;
}

function btnTextStyle(
  styles: ReturnType<typeof getStyles>,
  style?: DialogButton['style']
): object {
  if (style === 'cancel') return styles.btnTextCancel;
  if (style === 'destructive') return styles.btnTextDestructive;
  return styles.btnTextAccent;
}

/**
 * Hook that provides a `show` function and a `dialogNode` to render inside
 * the component's JSX. Use one instance per screen.
 *
 * @example
 *   const { show, dialogNode } = useDialog();
 *   show({ title: 'Fout', message: 'Probeer het opnieuw.' });
 *   // In JSX: {dialogNode}
 */
export function useDialog() {
  const [config, setConfig] = useState<DialogConfig | null>(null);

  const show = (cfg: DialogConfig) => setConfig(cfg);
  const dismiss = () => setConfig(null);

  const dialogNode = <AppDialog config={config} onDismiss={dismiss} />;

  return { show, dialogNode };
}

function getStyles(colors: ReturnType<typeof useAppColors>['colors']) {
  return StyleSheet.create({
    overlay: {
      flex: 1,
      backgroundColor: colors.scrimStrong,
      justifyContent: 'center',
      padding: 24,
    },
    card: {
      backgroundColor: colors.surfaceElevated,
      borderRadius: 14,
      padding: 24,
      gap: 12,
    },
    title: {
      color: colors.textPrimary,
      fontSize: 18,
      fontWeight: '700',
    },
    message: {
      color: colors.textSecondary,
      fontSize: 14,
      lineHeight: 20,
    },
    buttonRow: {
      flexDirection: 'row',
      gap: 10,
      marginTop: 4,
    },
    btn: {
      flex: 1,
      borderRadius: 10,
      padding: 14,
      alignItems: 'center',
    },
    btnCancel: { backgroundColor: colors.surface },
    btnDefault: { backgroundColor: colors.accentSecondary },
    btnDestructive: { backgroundColor: colors.error },
    btnText: { fontWeight: '700', fontSize: 15 },
    btnTextCancel: { color: colors.textPrimary, fontWeight: '600' },
    btnTextDestructive: { color: '#FFFFFF' },
    btnTextAccent: { color: colors.onAccent },
  });
}
