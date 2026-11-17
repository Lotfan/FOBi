import { router } from "expo-router";
import { useEffect, useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Theme } from "../constants/themes";
import {
  addEvent,
  deleteEvent,
  Event,
  getEvents,
  getPinned,
  Message,
} from "../db/database";
import { syncNow } from "../db/sync";
import { useTheme } from "../theme/ThemeProvider";

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const WEEKDAYS = ["M", "T", "W", "T", "F", "S", "S"];

function dateKey(y: number, m: number, d: number) {
  return `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function pinnedLabel(m: Message) {
  if (m.type === "photo") return "📷 Photo";
  if (m.type === "voice") return "🎤 Voice note";
  if (m.type === "drawing") return "✏️ Drawing";
  return m.text;
}

export default function CalendarScreen() {
  const { theme } = useTheme();
  const styles = makeStyles(theme);

  const [now] = useState(() => new Date());
  const todayKey = dateKey(now.getFullYear(), now.getMonth(), now.getDate());

  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());
  const [selected, setSelected] = useState(todayKey);
  const [events, setEvents] = useState<Event[]>(() => getEvents());
  const [pinned] = useState<Message[]>(() => getPinned());
  const [title, setTitle] = useState("");

  useEffect(() => {
    syncNow().then((ok) => {
      if (ok) setEvents(getEvents());
    });
  }, []);

  function shiftMonth(delta: number) {
    const d = new Date(year, month + delta, 1);
    setYear(d.getFullYear());
    setMonth(d.getMonth());
  }

  function add() {
    const t = title.trim();
    if (!t) return;
    addEvent(t, selected);
    setEvents(getEvents());
    setTitle("");
    syncNow();
  }

  function remove(id: number) {
    deleteEvent(id);
    setEvents(getEvents());
    syncNow();
  }

  // Build the month grid (weeks start on Monday)
  const offset = (new Date(year, month, 1).getDay() + 6) % 7;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: (number | null)[] = [
    ...Array<null>(offset).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  while (cells.length % 7 !== 0) cells.push(null);
  const weeks: (number | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));

  const eventDates = new Set(events.map((e) => e.date));
  const dayEvents = events.filter((e) => e.date === selected);
  const [, sm, sd] = selected.split("-").map(Number);

  return (
    <SafeAreaView style={styles.screen}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <View style={styles.topBar}>
          <Pressable onPress={() => router.back()}>
            <Text style={styles.link}>‹ Chat</Text>
          </Pressable>
          <Text style={styles.title}>Calendar</Text>
          <View style={{ width: 60 }} />
        </View>

        <ScrollView
          contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.monthRow}>
            <Pressable onPress={() => shiftMonth(-1)}>
              <Text style={styles.arrow}>‹</Text>
            </Pressable>
            <Text style={styles.monthTitle}>
              {MONTHS[month]} {year}
            </Text>
            <Pressable onPress={() => shiftMonth(1)}>
              <Text style={styles.arrow}>›</Text>
            </Pressable>
          </View>

          <View style={styles.weekRow}>
            {WEEKDAYS.map((d, i) => (
              <Text key={i} style={styles.weekday}>
                {d}
              </Text>
            ))}
          </View>

          {weeks.map((week, wi) => (
            <View key={wi} style={styles.weekRow}>
              {week.map((day, di) => {
                if (day === null) return <View key={di} style={styles.cell} />;
                const key = dateKey(year, month, day);
                const isSelected = key === selected;
                return (
                  <Pressable
                    key={di}
                    style={styles.cell}
                    onPress={() => setSelected(key)}
                  >
                    <View
                      style={[
                        styles.dayCircle,
                        key === todayKey && styles.today,
                        isSelected && styles.selected,
                      ]}
                    >
                      <Text
                        style={[styles.dayText, isSelected && styles.selectedText]}
                      >
                        {day}
                      </Text>
                    </View>
                    <View
                      style={[
                        styles.dot,
                        eventDates.has(key) && {
                          backgroundColor: theme.highlight,
                        },
                      ]}
                    />
                  </Pressable>
                );
              })}
            </View>
          ))}

          <Text style={styles.section}>
            {sd} {MONTHS[sm - 1]}
          </Text>
          {dayEvents.length === 0 && (
            <Text style={styles.empty}>No events this day.</Text>
          )}
          {dayEvents.map((e) => (
            <View key={e.id} style={styles.eventRow}>
              <Text style={styles.eventText}>{e.title}</Text>
              <Pressable onPress={() => remove(e.id)}>
                <Text style={styles.remove}>✕</Text>
              </Pressable>
            </View>
          ))}

          <View style={styles.addRow}>
            <TextInput
              style={styles.input}
              value={title}
              onChangeText={setTitle}
              placeholder="Add an event..."
              placeholderTextColor={theme.muted}
              onSubmitEditing={add}
              returnKeyType="done"
            />
            <Pressable style={styles.addBtn} onPress={add}>
              <Text style={styles.addText}>Add</Text>
            </Pressable>
          </View>

          <Text style={styles.section}>📌 Pinned</Text>
          {pinned.length === 0 && (
            <Text style={styles.empty}>
              Press and hold a message in your chat to pin it.
            </Text>
          )}
          {pinned.map((m) => (
            <View key={m.id} style={styles.pinRow}>
              <Text style={styles.pinText} numberOfLines={2}>
                {pinnedLabel(m)}
              </Text>
            </View>
          ))}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function makeStyles(t: Theme) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: t.bg },
    topBar: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      padding: 16,
      backgroundColor: t.bar,
    },
    title: { fontSize: 22, fontFamily: "Fraunces_900Black", color: t.text },
    link: { fontSize: 17, fontWeight: "700", color: t.text, width: 60 },
    monthRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: 12,
    },
    monthTitle: {
      fontSize: 22,
      fontFamily: "Fraunces_900Black",
      color: t.text,
    },
    arrow: {
      fontSize: 32,
      fontWeight: "700",
      color: t.text,
      paddingHorizontal: 12,
    },
    weekRow: { flexDirection: "row" },
    weekday: {
      flex: 1,
      textAlign: "center",
      fontWeight: "700",
      color: t.muted,
      marginBottom: 6,
    },
    cell: { flex: 1, alignItems: "center", paddingVertical: 4, minHeight: 50 },
    dayCircle: {
      width: 36,
      height: 36,
      borderRadius: 18,
      alignItems: "center",
      justifyContent: "center",
    },
    today: { borderWidth: 2, borderColor: t.text },
    selected: { backgroundColor: t.accent, borderWidth: 0 },
    dayText: { fontSize: 16, color: t.text, fontWeight: "600" },
    selectedText: { color: t.onAccent },
    dot: { width: 6, height: 6, borderRadius: 3, marginTop: 2 },
    section: {
      fontSize: 20,
      fontFamily: "Fraunces_900Black",
      color: t.text,
      marginTop: 24,
      marginBottom: 8,
    },
    empty: { color: t.muted, fontSize: 15 },
    eventRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      backgroundColor: t.bar,
      borderWidth: 1,
      borderColor: t.muted + "55",
      borderRadius: 14,
      padding: 12,
      marginBottom: 8,
    },
    pinRow: {
      backgroundColor: t.bubble,
      borderRadius: 14,
      padding: 12,
      marginBottom: 8,
    },
    eventText: { color: t.text, fontSize: 16, flexShrink: 1 },
    pinText: { color: t.onBubble, fontSize: 16 },
    remove: {
      color: t.text,
      fontSize: 18,
      fontWeight: "700",
      paddingLeft: 12,
    },
    addRow: { flexDirection: "row", gap: 8, marginTop: 8 },
    input: {
      flex: 1,
      backgroundColor: t.card,
      borderWidth: 1,
      borderColor: t.muted + "55",
      borderRadius: 20,
      paddingHorizontal: 14,
      paddingVertical: 10,
      fontSize: 16,
      color: t.text,
    },
    addBtn: {
      backgroundColor: t.accent,
      borderRadius: 20,
      paddingHorizontal: 18,
      justifyContent: "center",
    },
    addText: { color: t.onAccent, fontWeight: "700" },
  });
}