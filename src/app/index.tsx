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
import * as ImagePicker from "expo-image-picker";
import { router, useFocusEffect } from "expo-router";
import {
  AudioModule,
  RecordingPresets,
  setAudioModeAsync,
  useAudioPlayer,
  useAudioRecorder,
} from "expo-audio";
import { Theme } from "../constants/themes";
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
  getSyncReport,
  hasUploadProblems,
  syncNow,
} from "../db/sync";
import { dayKey, formatDay, formatTime } from "../lib/time";
import { useTheme } from "../theme/ThemeProvider";

function useStyles() {
  const { theme } = useTheme();
  return { theme, styles: makeStyles(theme) };
}

type VoiceProps = {
  file: string;
  pinned: boolean;
  time: string;
  onLongPress: () => void;
};

function VoicePlayer({ file, pinned, time, onLongPress }: VoiceProps) {
  const { styles } = useStyles();
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
      <Text style={styles.bubbleText}>
        {pinned ? "📌 " : ""}▶  Voice note
      </Text>
      <Text style={styles.time}>{time}</Text>
    </Pressable>
  );
}

function VoiceNote(props: VoiceProps) {
  const { styles } = useStyles();
  if (!mediaExists(props.file)) {
    return (
      <View style={styles.bubble}>
        <Text style={styles.bubbleText}>Downloading voice note…</Text>
        <Text style={styles.time}>{props.time}</Text>
      </View>
    );
  }
  return <VoicePlayer {...props} />;
}

export default function Chat() {
  const { theme, styles } = useStyles();
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
    }, [])
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
            getSyncReport() || "Sync didn't run. Are you signed in and online?"
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
              "Some files haven't uploaded, so nothing was cleared. Tap Sync now to see why."
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
        "Allow microphone access in Settings."
      );
      return;
    }
    await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
    await recorder.prepareToRecordAsync();
    recorder.record();
    setRecording(true);
  }

  function renderBubble(item: Message) {
    const time = formatTime(item.created_at);

    if ((item.type === "photo" || item.type === "drawing") && item.file) {
      const file = item.file;
      const present = mediaExists(file);
      return (
        <View style={styles.photoWrap}>
          <Pressable
            onPress={() => {
              if (present) {
                router.push({ pathname: "/draw", params: { photo: file } });
              }
            }}
            onLongPress={() => pin(item.id)}
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
          <Text style={styles.photoTime}>{time}</Text>
        </View>
      );
    }

    if (item.type === "voice" && item.file) {
      return (
        <VoiceNote
          file={item.file}
          pinned={!!item.pinned}
          time={time}
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
        <Text style={styles.time}>{time}</Text>
      </Pressable>
    );
  }

  function renderItem({ item, index }: { item: Message; index: number }) {
    // The list is upside down, so the next item is the older message
    const older = messages[index + 1];
    const showDay =
      !older || dayKey(older.created_at) !== dayKey(item.created_at);
    return (
      <View>
        {showDay ? (
          <Text style={styles.dayHeader}>{formatDay(item.created_at)}</Text>
        ) : null}
        {renderBubble(item)}
      </View>
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
          <Pressable onPress={() => router.push("/settings")}>
            <Text style={styles.icon}>🎨</Text>
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
          <Pressable style={styles.iconBtn} onPress={() => router.push("/draw")}>
            <Text style={styles.icon}>✏️</Text>
          </Pressable>
          <TextInput
            style={styles.input}
            value={text}
            onChangeText={setText}
            placeholder={recording ? "Recording..." : "Write to yourself..."}
            placeholderTextColor={theme.muted}
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
                recording && { backgroundColor: theme.highlight },
              ]}
              onPress={toggleRecord}
            >
              <Text
                style={[
                  styles.sendText,
                  recording && { color: theme.onHighlight },
                ]}
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

function makeStyles(t: Theme) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: t.bg },
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
      color: t.text,
    },
    dayHeader: {
      alignSelf: "center",
      backgroundColor: t.bar,
      color: t.text,
      fontSize: 12,
      fontWeight: "700",
      paddingHorizontal: 12,
      paddingVertical: 4,
      borderRadius: 12,
      overflow: "hidden",
      marginVertical: 10,
    },
    bubble: {
      alignSelf: "flex-end",
      maxWidth: "80%",
      backgroundColor: t.bubble,
      borderRadius: 18,
      paddingHorizontal: 14,
      paddingTop: 10,
      paddingBottom: 6,
      marginBottom: 8,
    },
    bubbleText: { color: t.onBubble, fontSize: 16 },
    time: {
      color: t.onBubble,
      opacity: 0.6,
      fontSize: 11,
      alignSelf: "flex-end",
      marginTop: 3,
    },
    photoWrap: {
      alignSelf: "flex-end",
      alignItems: "flex-end",
      marginBottom: 8,
    },
    photo: {
      width: 220,
      height: 220,
      borderRadius: 18,
      backgroundColor: t.bubble,
    },
    photoLoading: { alignItems: "center", justifyContent: "center" },
    photoTime: { color: t.muted, fontSize: 11, marginTop: 3 },
    pinBadge: { position: "absolute", top: 8, right: 8, fontSize: 20 },
    inputRow: {
      flexDirection: "row",
      alignItems: "flex-end",
      gap: 8,
      padding: 12,
      backgroundColor: t.bar,
    },
    iconBtn: { paddingVertical: 8 },
    icon: { fontSize: 24 },
    input: {
      flex: 1,
      maxHeight: 120,
      backgroundColor: t.card,
      borderRadius: 20,
      paddingHorizontal: 14,
      paddingVertical: 10,
      fontSize: 16,
      color: t.text,
    },
    sendBtn: {
      backgroundColor: t.accent,
      borderRadius: 20,
      paddingHorizontal: 18,
      paddingVertical: 12,
    },
    sendText: { color: t.onAccent, fontWeight: "700" },
  });
}