import {
  AudioModule,
  RecordingPresets,
  setAudioModeAsync,
  useAudioPlayer,
  useAudioRecorder,
} from "expo-audio";
import * as ImagePicker from "expo-image-picker";
import { router, useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import {
  Alert,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { colors } from "../constants/theme";
import {
  addMedia,
  addMessage,
  clearLocal,
  deleteMessage,
  getMessages,
  Message,
  togglePin,
} from "../db/database";
import {
  clearMediaFolder,
  deleteMedia,
  mediaExists,
  mediaUri,
  saveMedia,
} from "../db/media";
import { supabase } from "../db/supabase";
import {
  deleteCloudMedia,
  deleteMyAccount,
  getSyncReport,
  hasUploadProblems,
  syncNow,
} from "../db/sync";

type VoiceProps = {
  file: string;
  pinned: boolean;
  onLongPress: () => void;
};

function VoicePlayer({ file, pinned, onLongPress }: VoiceProps) {
  const player = useAudioPlayer(mediaUri(file));
  return (
    <Pressable
      onPress={() => {
        player.seekTo(0);
        player.play();
      }}
      onLongPress={onLongPress}
      style={styles.bubble}
    >
      <Text style={styles.bubbleText}>{pinned ? "📌 " : ""}▶ Voice note</Text>
    </Pressable>
  );
}

function VoiceNote(props: VoiceProps) {
  if (!mediaExists(props.file)) {
    return (
      <View style={styles.bubble}>
        <Text style={styles.bubbleText}>Downloading voice note…</Text>
      </View>
    );
  }
  return <VoicePlayer {...props} />;
}

export default function Chat() {
  const [messages, setMessages] = useState<Message[]>(() => getMessages());
  const [text, setText] = useState("");
  const [recording, setRecording] = useState(false);
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);

  // Show local data right away, then sync with the cloud in the background
  const refresh = () => {
    setMessages(getMessages());
    syncNow().then((ok) => {
      if (ok) setMessages(getMessages());
    });
  };

  // Refresh and sync whenever we come back to this screen
  useFocusEffect(
    useCallback(() => {
      refresh();
    }, []),
  );

  function send() {
    const trimmed = text.trim();
    if (!trimmed) return;
    addMessage(trimmed);
    refresh();
    setText("");
  }

  function account() {
    Alert.alert("Account", undefined, [
      {
        text: "Sync now",
        onPress: async () => {
          await syncNow();
          setMessages(getMessages());
          Alert.alert(
            "Sync report",
            getSyncReport() || "Sync didn't run. Are you signed in and online?",
          );
        },
      },
      {
        text: "Clear this phone's copy (test)",
        style: "destructive",
        onPress: async () => {
          const ok = await syncNow();
          if (!ok || hasUploadProblems()) {
            Alert.alert(
              "Not everything is backed up yet",
              "Some files haven't uploaded, so nothing was cleared. Tap Sync now to see why.",
            );
            return;
          }
          clearLocal();
          clearMediaFolder();
          setMessages(getMessages());
          refresh();
        },
      },
      { text: "Sign out", onPress: () => supabase.auth.signOut() },
      {
        text: "Delete account",
        style: "destructive",
        onPress: () =>
          Alert.alert(
            "Delete your account?",
            "This permanently deletes your account and all your messages, photos, voice notes, drawings and events, from the cloud and from this phone. It can't be undone.",
            [
              { text: "Cancel", style: "cancel" },
              {
                text: "Delete forever",
                style: "destructive",
                onPress: async () => {
                  const problem = await deleteMyAccount();
                  if (problem) {
                    Alert.alert("Couldn't delete the account", problem);
                  }
                },
              },
            ],
          ),
      },
      { text: "Cancel", style: "cancel" },
    ]);
  }

  // Hold a message to pin or delete it
  function pin(id: number) {
    const msg = messages.find((m) => m.id === id);
    Alert.alert("Message", undefined, [
      {
        text: msg?.pinned ? "Unpin" : "Pin",
        onPress: () => {
          togglePin(id);
          refresh();
        },
      },
      {
        text: "Delete",
        style: "destructive",
        onPress: () => {
          if (msg?.file) {
            deleteMedia(msg.file);
            deleteCloudMedia(msg.file);
          }
          deleteMessage(id);
          refresh();
        },
      },
      { text: "Cancel", style: "cancel" },
    ]);
  }

  async function takePhoto() {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      Alert.alert("Camera access needed", "Allow camera access in Settings.");
      return;
    }
    const res = await ImagePicker.launchCameraAsync({ quality: 0.7 });
    if (!res.canceled) {
      addMedia("photo", saveMedia(res.assets[0].uri, "jpg"));
      refresh();
    }
  }

  async function pickPhoto() {
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      quality: 0.7,
    });
    if (!res.canceled) {
      addMedia("photo", saveMedia(res.assets[0].uri, "jpg"));
      refresh();
    }
  }

  async function toggleRecord() {
    if (recording) {
      await recorder.stop();
      setRecording(false);
      await setAudioModeAsync({
        allowsRecording: false,
        playsInSilentMode: true,
      });
      if (recorder.uri) {
        addMedia("voice", saveMedia(recorder.uri, "m4a"));
        refresh();
      }
      return;
    }
    const perm = await AudioModule.requestRecordingPermissionsAsync();
    if (!perm.granted) {
      Alert.alert(
        "Microphone access needed",
        "Allow microphone access in Settings.",
      );
      return;
    }
    await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
    await recorder.prepareToRecordAsync();
    recorder.record();
    setRecording(true);
  }

  function renderItem({ item }: { item: Message }) {
    if ((item.type === "photo" || item.type === "drawing") && item.file) {
      const file = item.file;
      const present = mediaExists(file);
      return (
        <Pressable
          onPress={() => {
            if (present) {
              router.push({ pathname: "/draw", params: { photo: file } });
            }
          }}
          onLongPress={() => pin(item.id)}
          style={styles.photoWrap}
        >
          {present ? (
            <Image source={{ uri: mediaUri(file) }} style={styles.photo} />
          ) : (
            <View style={[styles.photo, styles.photoLoading]}>
              <Text style={styles.bubbleText}>Downloading…</Text>
            </View>
          )}
          {item.pinned ? <Text style={styles.pinBadge}>📌</Text> : null}
        </Pressable>
      );
    }
    if (item.type === "voice" && item.file) {
      return (
        <VoiceNote
          file={item.file}
          pinned={!!item.pinned}
          onLongPress={() => pin(item.id)}
        />
      );
    }
    return (
      <Pressable style={styles.bubble} onLongPress={() => pin(item.id)}>
        <Text style={styles.bubbleText}>
          {item.pinned ? "📌 " : ""}
          {item.text}
        </Text>
      </Pressable>
    );
  }

  return (
    <SafeAreaView style={styles.screen}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <View style={styles.header}>
          <Text style={styles.title}>Fobi</Text>
          <Pressable onPress={() => router.push("/calendar")}>
            <Text style={styles.icon}>📅</Text>
          </Pressable>
          <Pressable onPress={account}>
            <Text style={styles.icon}>👤</Text>
          </Pressable>
        </View>

        <FlatList
          data={messages}
          inverted
          keyExtractor={(m) => String(m.id)}
          contentContainerStyle={{ padding: 16 }}
          renderItem={renderItem}
        />

        <View style={styles.inputRow}>
          <Pressable style={styles.iconBtn} onPress={takePhoto}>
            <Text style={styles.icon}>📷</Text>
          </Pressable>
          <Pressable style={styles.iconBtn} onPress={pickPhoto}>
            <Text style={styles.icon}>🖼️</Text>
          </Pressable>
          <Pressable
            style={styles.iconBtn}
            onPress={() => router.push("/draw")}
          >
            <Text style={styles.icon}>✏️</Text>
          </Pressable>
          <TextInput
            style={styles.input}
            value={text}
            onChangeText={setText}
            placeholder={recording ? "Recording..." : "Write to yourself..."}
            placeholderTextColor={colors.navy + "99"}
            multiline
          />
          {text.trim() ? (
            <Pressable style={styles.sendBtn} onPress={send}>
              <Text style={styles.sendText}>Send</Text>
            </Pressable>
          ) : (
            <Pressable
              style={[
                styles.sendBtn,
                recording && { backgroundColor: colors.mustard },
              ]}
              onPress={toggleRecord}
            >
              <Text
                style={[styles.sendText, recording && { color: colors.navy }]}
              >
                {recording ? "Stop" : "🎤"}
              </Text>
            </Pressable>
          )}
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.cream },
  header: {
    flexDirection: "row",
    justifyContent: "flex-start",
    alignItems: "center",
    gap: 14,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  title: {
    fontSize: 28,
    fontFamily: "Fraunces_900Black",
    color: colors.navy,
  },
  bubble: {
    alignSelf: "flex-end",
    maxWidth: "80%",
    backgroundColor: colors.blue,
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: 8,
  },
  bubbleText: { color: colors.navy, fontSize: 16 },
  photoWrap: { alignSelf: "flex-end", marginBottom: 8 },
  photo: {
    width: 220,
    height: 220,
    borderRadius: 18,
    backgroundColor: colors.blue,
  },
  photoLoading: { alignItems: "center", justifyContent: "center" },
  pinBadge: { position: "absolute", top: 8, right: 8, fontSize: 20 },
  inputRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 8,
    padding: 12,
    backgroundColor: colors.butter,
  },
  iconBtn: { paddingVertical: 8 },
  icon: { fontSize: 24 },
  input: {
    flex: 1,
    maxHeight: 120,
    backgroundColor: colors.cream,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 16,
    color: colors.navy,
  },
  sendBtn: {
    backgroundColor: colors.navy,
    borderRadius: 20,
    paddingHorizontal: 18,
    paddingVertical: 12,
  },
  sendText: { color: colors.cream, fontWeight: "700" },
});
