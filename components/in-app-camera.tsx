import React, { useEffect, useRef, useState } from 'react';
import {
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  Image,
  ScrollView,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';

import { useAppColors } from '@/hooks/use-app-colors';
import { useDialog } from '@/components/ui/app-dialog';

type InAppCameraProps = {
  visible: boolean;
  onClose: () => void;
  onCapture: (uris: string[]) => Promise<void> | void;
  initialUris?: string[];
};

export function InAppCamera({ visible, onClose, onCapture, initialUris = [] }: InAppCameraProps) {
  const { colors } = useAppColors();
  const styles = getStyles(colors);
  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef<CameraView | null>(null);
  const [isCapturing, setIsCapturing] = useState(false);
  const [isCameraReady, setIsCameraReady] = useState(false);
  const [capturedUris, setCapturedUris] = useState<string[]>([]);
  const { show: showDialog, dialogNode } = useDialog();

  useEffect(() => {
    if (visible) {
      setCapturedUris(initialUris.slice(0, 5));
      setIsCapturing(false);
      setIsCameraReady(false);
      return;
    }

    if (!visible) {
      setIsCameraReady(false);
      setIsCapturing(false);
    }
  }, [visible, initialUris]);

  const handleTakePhoto = async () => {
    if (!cameraRef.current || isCapturing || !isCameraReady) return;
    if (capturedUris.length >= 5) {
      showDialog({ title: 'Limiet bereikt', message: 'Je kunt maximaal 5 foto\'s toevoegen per onkost.' });
      return;
    }

    try {
      setIsCapturing(true);
      const photo = await cameraRef.current.takePictureAsync({ quality: 0.7, skipProcessing: true });
      if (!photo?.uri) {
        showDialog({ title: 'Fout', message: 'Foto maken is mislukt.' });
        return;
      }
      setCapturedUris(prev => [...prev, photo.uri]);
    } catch {
      showDialog({ title: 'Fout', message: 'Foto maken is mislukt.' });
    } finally {
      setIsCapturing(false);
    }
  };

  const handleDone = async () => {
    try {
      await onCapture(capturedUris);
      onClose();
    } catch {
      showDialog({ title: 'Fout', message: 'Kon foto\'s niet opslaan.' });
    }
  };

  const removePhoto = (indexToRemove: number) => {
    setCapturedUris(prev => prev.filter((_, i) => i !== indexToRemove));
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
            <CameraView
              ref={cameraRef}
              style={StyleSheet.absoluteFill}
              facing="back"
              active={visible}
              onCameraReady={() => setIsCameraReady(true)}
            />
            <View style={styles.overlayTop}>
              <TouchableOpacity style={styles.closeButton} onPress={onClose}
                accessibilityLabel="Camera sluiten"
                accessibilityRole="button">
                <Text style={styles.closeButtonText}>Sluiten</Text>
              </TouchableOpacity>
            </View>

            {capturedUris.length > 0 && (
              <View style={styles.previewStrip}>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.previewStripContent}>
                  {capturedUris.map((uri, index) => (
                    <View key={index} style={styles.previewContainer}>
                      <Image source={{ uri }} style={styles.previewImage} />
                      <TouchableOpacity style={styles.previewRemoveBtn} onPress={() => removePhoto(index)}>
                        <Text style={styles.previewRemoveText}>✕</Text>
                      </TouchableOpacity>
                    </View>
                  ))}
                </ScrollView>
              </View>
            )}

            <View style={styles.overlayBottom}>
              <View style={styles.captureButtonCenter}>
                <TouchableOpacity
                  style={[styles.captureButton, (isCapturing || !isCameraReady || capturedUris.length >= 5) && styles.captureButtonDisabled]}
                  onPress={handleTakePhoto}
                  disabled={isCapturing || !isCameraReady || capturedUris.length >= 5}
                  accessibilityLabel="Foto maken"
                  accessibilityRole="button">
                  <Text style={styles.captureButtonText}>
                    {isCapturing ? 'Opslaan...' : isCameraReady ? 'Foto maken' : 'Camera laden...'}
                  </Text>
                </TouchableOpacity>
              </View>

              <View style={styles.doneButtonSlot}>
                {capturedUris.length > 0 && (
                  <TouchableOpacity
                    style={styles.doneButton}
                    onPress={handleDone}
                    accessibilityLabel="Klaar"
                    accessibilityRole="button">
                    <Text style={styles.doneButtonText}>Klaar ({capturedUris.length})</Text>
                  </TouchableOpacity>
                )}
              </View>
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
    minHeight: 92,
    paddingHorizontal: 16,
    paddingVertical: 20,
    justifyContent: 'center',
    backgroundColor: colors.scrim,
  },
  captureButtonCenter: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 20,
    bottom: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  doneButtonSlot: {
    alignSelf: 'stretch',
    minHeight: 52,
    alignItems: 'flex-end',
    justifyContent: 'center',
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
  doneButton: {
    backgroundColor: colors.success,
    borderRadius: 999,
    paddingVertical: 14,
    paddingHorizontal: 24,
  },
  doneButtonText: { color: colors.bg, fontWeight: '700', fontSize: 16 },
  previewStrip: {
    position: 'absolute',
    bottom: 100, // Above overlayBottom
    left: 0,
    right: 0,
    height: 80,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  previewStripContent: {
    paddingHorizontal: 16,
    alignItems: 'center',
    gap: 12,
  },
  previewContainer: {
    position: 'relative',
    width: 60,
    height: 60,
    borderRadius: 8,
    overflow: 'hidden',
  },
  previewImage: {
    width: '100%',
    height: '100%',
  },
  previewRemoveBtn: {
    position: 'absolute',
    top: -4,
    right: -4,
    backgroundColor: colors.error,
    borderRadius: 12,
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewRemoveText: {
    color: colors.bg,
    fontSize: 14,
    fontWeight: 'bold',
  },
});
}
