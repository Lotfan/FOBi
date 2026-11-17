import { router } from "expo-router";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Theme, themes } from "../constants/themes";
import { useTheme } from "../theme/ThemeProvider";

function ThemeRow({
  t,
  selected,
  onPress,
}: {
  t: Theme;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={{
        backgroundColor: t.bg,
        borderRadius: 20,
        padding: 14,
        gap: 10,
        borderWidth: selected ? 3 : 1,
        borderColor: selected ? t.accent : t.bar,
      }}
    >
      <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
        <Text
          style={{ fontFamily: "Fraunces_900Black", fontSize: 20, color: t.text }}
        >
          {t.name}
        </Text>
        {selected ? (
          <Text style={{ color: t.text, fontWeight: "800", fontSize: 18 }}>✓</Text>
        ) : null}
      </View>

      <View
        style={{
          alignSelf: "flex-end",
          backgroundColor: t.bubble,
          borderRadius: 16,
          paddingHorizontal: 12,
          paddingVertical: 8,
        }}
      >
        <Text style={{ color: t.onBubble }}>Hello, me 👋</Text>
      </View>

      <View style={{ flexDirection: "row", gap: 8 }}>
        {[t.bar, t.accent, t.bubble, t.highlight].map((c, i) => (
          <View
            key={i}
            style={{
              width: 22,
              height: 22,
              borderRadius: 11,
              backgroundColor: c,
              borderWidth: 1,
              borderColor: t.text + "33",
            }}
          />
        ))}
      </View>
    </Pressable>
  );
}

export default function Settings() {
  const { theme, setThemeId } = useTheme();
  const styles = makeStyles(theme);

  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.topBar}>
        <Pressable onPress={() => router.back()}>
          <Text style={styles.link}>‹ Chat</Text>
        </Pressable>
        <Text style={styles.title}>Theme</Text>
        <View style={{ width: 60 }} />
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
        {themes.map((t) => (
          <ThemeRow
            key={t.id}
            t={t}
            selected={t.id === theme.id}
            onPress={() => setThemeId(t.id)}
          />
        ))}
      </ScrollView>
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
  });
}