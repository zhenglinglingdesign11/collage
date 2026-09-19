import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { type RemoteAssetIntegrityDescriptor } from '@journalcollage/asset-system';
import { cacheVerifiedRemoteAsset } from './verifiedRemoteAssetCache';

const expected = {
  packRevision: '1',
  mimeType: 'image/png' as const,
  byteLength: 21691,
  sha256: '8ca1ef671c1f28bf881fc6724842efb1a3c65c4a3a2b60ce28c1f6d4606751f6',
  pixelSize: { width: 224, height: 242 },
};

const descriptorFor = (itemId: string, sourceUrl: string): RemoteAssetIntegrityDescriptor => ({
  reference: { id: `asset://pack/zhenzhi01/${itemId}`, kind: 'image', revision: '1' },
  ...expected,
  sourceUrl,
});

const errorCode = (error: unknown): string => error && typeof error === 'object' && 'code' in error ? String(error.code) : String(error);

/** Development-only real Expo probe for P1-A02's R2, cancellation, and network-failure paths. */
export const RemoteAssetVerificationProbe = () => {
  const [status, setStatus] = useState('Remote asset verification not run');
  const runOnline = async () => {
    setStatus('Downloading zhenzhi01 from R2…');
    try {
      const uri = await cacheVerifiedRemoteAsset(descriptorFor('1', 'https://assets.zllarchi.site/packs/zhenzhi01/items/1.png'));
      setStatus(`PASS · R2 verified and cached (${uri.split('/').at(-1)})`);
    } catch (error) { setStatus(`FAIL · ${errorCode(error)}`); }
  };
  const runCancellation = async () => {
    setStatus('Starting then cancelling an isolated download…');
    const controller = new AbortController();
    const promise = cacheVerifiedRemoteAsset(descriptorFor('cancel-probe', 'https://assets.zllarchi.site/packs/zhenzhi01/items/1.png'), { signal: controller.signal });
    controller.abort();
    try {
      await promise;
      setStatus('FAIL · cancellation unexpectedly completed');
    } catch (error) { setStatus(errorCode(error) === 'asset-download-cancelled' ? 'PASS · cancellation reported without a cache record' : `FAIL · ${errorCode(error)}`); }
  };
  const runNetworkFailure = async () => {
    setStatus('Testing an unreachable HTTPS endpoint (two bounded attempts)…');
    try {
      await cacheVerifiedRemoteAsset(descriptorFor('offline-probe', 'https://127.0.0.1:1/zhenzhi01.png'));
      setStatus('FAIL · unreachable endpoint unexpectedly completed');
    } catch (error) { setStatus(errorCode(error) === 'asset-download-failed' ? 'PASS · network failure retried then cleaned up' : `FAIL · ${errorCode(error)}`); }
  };
  return <View style={styles.panel}>
    <Text style={styles.title}>P1-A02 remote asset probe</Text>
    <View style={styles.actions}>
      <Pressable accessibilityLabel="Verify zhenzhi01 R2 asset" onPress={() => { void runOnline(); }} style={styles.button}><Text style={styles.buttonText}>Verify R2</Text></Pressable>
      <Pressable accessibilityLabel="Cancel remote asset download" onPress={() => { void runCancellation(); }} style={styles.button}><Text style={styles.buttonText}>Cancel</Text></Pressable>
      <Pressable accessibilityLabel="Test remote asset network failure" onPress={() => { void runNetworkFailure(); }} style={styles.button}><Text style={styles.buttonText}>Network fail</Text></Pressable>
    </View>
    <Text accessibilityLabel="Remote asset verification status" style={styles.status}>{status}</Text>
  </View>;
};

const styles = StyleSheet.create({ panel: { bottom: 58, left: 6, position: 'absolute', right: 6, zIndex: 99 }, title: { backgroundColor: '#111', color: '#fff', fontSize: 10, fontWeight: '700', paddingHorizontal: 8, paddingTop: 6 }, actions: { backgroundColor: '#111', flexDirection: 'row', gap: 6, padding: 6 }, button: { backgroundColor: '#fff', borderRadius: 10, paddingHorizontal: 8, paddingVertical: 6 }, buttonText: { color: '#111', fontSize: 10, fontWeight: '700' }, status: { backgroundColor: '#fff', color: '#111', fontSize: 10, padding: 6 } });
