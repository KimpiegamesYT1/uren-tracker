import React, { useRef, useState } from 'react';
import {
  Alert,
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';

import { Colors } from '@/constants/colors';

type InAppCameraProps = {
  visible: boolean;
  onClose: () => void;
  onCapture: (uri: string) => Promise<void> | void;
};

export function InAppCamera({ visible, onClose, onCapture }: InAppCameraProps) {
  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef<CameraView | null>(null);
  const [isCapturing, setIsCapturing] = useState(false);

  const handleTakePhoto = async () => {
    if (!cameraRef.current || isCapturing) return;

    try {
      setIsCapturing(true);
      const photo = await cameraRef.current.takePictureAsync({ quality: 0.7 });
      if (!photo?.uri) {
        Alert.alert('Fout', 'Foto maken is mislukt.');
        return;
      }
      await onCapture(photo.uri);
      onClose();
    } catch {
      Alert.alert('Fout', 'Foto maken is mislukt.');
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
      <TouchableOpacity style={styles.primaryButton} onPress={requestPermission}>
        <Text style={styles.primaryButtonText}>Toegang geven</Text>
      </TouchableOpacity>
      <TouchableOpacity style={styles.secondaryButton} onPress={onClose}>
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
              <TouchableOpacity style={styles.closeButton} onPress={onClose}>
                <Text style={styles.closeButtonText}>Sluiten</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.overlayBottom}>
              <TouchableOpacity
                style={[styles.captureButton, isCapturing && styles.captureButtonDisabled]}
                onPress={handleTakePhoto}
                disabled={isCapturing}>
                <Text style={styles.captureButtonText}>
                  {isCapturing ? 'Opslaan...' : 'Foto maken'}
                </Text>
              </TouchableOpacity>
            </View>
          </>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000000' },
  permissionContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
    gap: 12,
    backgroundColor: Colors.bg,
  },
  permissionTitle: { color: Colors.textPrimary, fontSize: 22, fontWeight: '700' },
  permissionText: { color: Colors.textSecondary, fontSize: 15, textAlign: 'center' },
  primaryButton: {
    marginTop: 10,
    backgroundColor: Colors.accentSecondary,
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 20,
  },
  primaryButtonText: { color: '#FFFFFF', fontWeight: '700', fontSize: 15 },
  secondaryButton: { padding: 10 },
  secondaryButtonText: { color: Colors.textSecondary, fontSize: 14 },
  overlayTop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    padding: 16,
    alignItems: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  closeButton: {
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.5)',
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  closeButtonText: { color: '#FFFFFF', fontWeight: '600' },
  overlayBottom: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: 24,
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  captureButton: {
    backgroundColor: '#FFFFFF',
    borderRadius: 999,
    paddingVertical: 14,
    paddingHorizontal: 24,
  },
  captureButtonDisabled: {
    opacity: 0.6,
  },
  captureButtonText: { color: '#1D2B3A', fontWeight: '700', fontSize: 16 },
});
