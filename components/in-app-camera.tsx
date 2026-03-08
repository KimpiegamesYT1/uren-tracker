import React, { useRef, useState } from 'react';
import {
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';

import { useAppColors } from '@/hooks/use-app-colors';
import { useDialog } from '@/components/ui/app-dialog';

type InAppCameraProps = {
  visible: boolean;
  onClose: () => void;
  onCapture: (uri: string) => Promise<void> | void;
};

export function InAppCamera({ visible, onClose, onCapture }: InAppCameraProps) {
  const { colors } = useAppColors();
  const styles = getStyles(colors);
  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef<CameraView | null>(null);
  const [isCapturing, setIsCapturing] = useState(false);
  const { show: showDialog, dialogNode } = useDialog();

  const handleTakePhoto = async () => {
    if (!cameraRef.current || isCapturing) return;

    try {
      setIsCapturing(true);
      const photo = await cameraRef.current.takePictureAsync({ quality: 0.7 });
      if (!photo?.uri) {
        showDialog({ title: 'Fout', message: 'Foto maken is mislukt.' });
        return;
      }
      await onCapture(photo.uri);
      onClose();
    } catch {
      showDialog({ title: 'Fout', message: 'Foto maken is mislukt.' });
    } finally {
      setIsCapturing(false);
    }
  };

  const renderPermissionView = () => (
    <View style={styles.permissionContainer}>
      <Text style={styles.permissionTitle}>Camera-toegang nodig</Text>
      <Text style={styles.permissionText}>
        Sta camera-toegang toe om een bonfoto in de app te maken.
      </Text>
      <TouchableOpacity style={styles.primaryButton} onPress={requestPermission}
        accessibilityLabel="Camera-toegang geven"
        accessibilityRole="button">
        <Text style={styles.primaryButtonText}>Toegang geven</Text>
      </TouchableOpacity>
      <TouchableOpacity style={styles.secondaryButton} onPress={onClose}
        accessibilityLabel="Camera sluiten"
        accessibilityRole="button">
        <Text style={styles.secondaryButtonText}>Annuleren</Text>
      </TouchableOpacity>
    </View>
  );

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={styles.container}>
        {!permission || !permission.granted ? (
          renderPermissionView()
        ) : (
          <>
            <CameraView ref={cameraRef} style={StyleSheet.absoluteFill} facing="back" />
            <View style={styles.overlayTop}>
              <TouchableOpacity style={styles.closeButton} onPress={onClose}
                accessibilityLabel="Camera sluiten"
                accessibilityRole="button">
                <Text style={styles.closeButtonText}>Sluiten</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.overlayBottom}>
              <TouchableOpacity
                style={[styles.captureButton, isCapturing && styles.captureButtonDisabled]}
                onPress={handleTakePhoto}
                disabled={isCapturing}
                accessibilityLabel={isCapturing ? 'Foto wordt opgeslagen' : 'Foto maken'}
                accessibilityRole="button">
                <Text style={styles.captureButtonText}>
                  {isCapturing ? 'Opslaan...' : 'Foto maken'}
                </Text>
              </TouchableOpacity>
            </View>
          </>
        )}
        {dialogNode}
      </View>
    </Modal>
  );
}

function getStyles(colors: ReturnType<typeof useAppColors>['colors']) {
  return StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  permissionContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
    gap: 12,
    backgroundColor: colors.bg,
  },
  permissionTitle: { color: colors.textPrimary, fontSize: 22, fontWeight: '700' },
  permissionText: { color: colors.textSecondary, fontSize: 15, textAlign: 'center' },
  primaryButton: {
    marginTop: 10,
    backgroundColor: colors.accentSecondary,
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 20,
  },
  primaryButtonText: { color: colors.onAccent, fontWeight: '700', fontSize: 15 },
  secondaryButton: { padding: 10 },
  secondaryButtonText: { color: colors.textSecondary, fontSize: 14 },
  overlayTop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    padding: 16,
    alignItems: 'flex-end',
    backgroundColor: colors.scrimSoft,
  },
  closeButton: {
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: colors.scrim,
  },
  closeButtonText: { color: colors.textPrimary, fontWeight: '600' },
  overlayBottom: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: 24,
    alignItems: 'center',
    backgroundColor: colors.scrim,
  },
  captureButton: {
    backgroundColor: colors.accentSecondary,
    borderRadius: 999,
    paddingVertical: 14,
    paddingHorizontal: 24,
  },
  captureButtonDisabled: {
    opacity: 0.6,
  },
  captureButtonText: { color: colors.onAccent, fontWeight: '700', fontSize: 16 },
});
}
