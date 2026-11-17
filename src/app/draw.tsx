import {
  Canvas,
  Fill,
  Image as SkiaImage,
  Path,
  useCanvasRef,
  useImage,
} from "@shopify/react-native-skia";
import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Theme } from "../constants/themes";
import { addMedia } from "../db/database";
import { mediaUri, saveBytes } from "../db/media";
import { useTheme } from "../theme/ThemeProvider";

type Point = { x: number; y: number };
type Stroke = { points: Point[]; color: string; width: number };

const SIZES = [3, 8, 16];

// Turns a list of finger positions into a path written as text
function buildPath(points: Point[]) {
  if (points.length === 0) return "";
  const [first, ...rest] = points;
  let d = `M ${first.x} ${first.y}`;
  if (rest.length === 0) d += ` L ${first.x + 0.01} ${first.y}`;
  for (const p of rest) d += ` L ${p.x} ${p.y}`;
  return d;
}

export default function Draw() {
  const { theme } = useTheme();
  const styles = makeStyles(theme);

  // If we were opened from a photo, "photo" holds its file name
  const { photo } = useLocalSearchParams<{ photo?: string }>();
  const background = useImage(photo ? mediaUri(photo) : null);

  const canvasRef = useCanvasRef();
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [color, setColor] = useState(theme.text);
  const [width, setWidth] = useState(SIZES[1]);

  // Ink colours: two from the theme, plus a few that work on any background
  const palette = [
    theme.text,
    theme.accent,
    "#D9534F",
    "#E6A23C",
    "#4F9D69",
    "#4A78C8",
  ];

  function save() {
    if (strokes.length === 0) {
      router.back();
      return;
    }
    const image = canvasRef.current?.makeImageSnapshot();
    if (!image) return;
    addMedia("drawing", saveBytes(image.encodeToBytes(), "png"));
    router.back();
  }

  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.topBar}>
        <Pressable onPress={() => router.back()}>
          <Text style={styles.link}>Cancel</Text>
        </Pressable>
        <Text style={styles.title}>Draw</Text>
        <Pressable onPress={save}>
          <Text style={styles.link}>Save</Text>
        </Pressable>
      </View>

      <View
        style={styles.canvasWrap}
        onLayout={(e) =>
          setSize({
            w: e.nativeEvent.layout.width,
            h: e.nativeEvent.layout.height,
          })
        }
        onTouchStart={(e) => {
          const { locationX: x, locationY: y } = e.nativeEvent;
          setStrokes((prev) => [...prev, { points: [{ x, y }], color, width }]);
        }}
        onTouchMove={(e) => {
          const { locationX: x, locationY: y } = e.nativeEvent;
          setStrokes((prev) => {
            if (prev.length === 0) return prev;
            const last = prev[prev.length - 1];
            return [
              ...prev.slice(0, -1),
              { ...last, points: [...last.points, { x, y }] },
            ];
          });
        }}
      >
        <Canvas ref={canvasRef} style={{ flex: 1 }} pointerEvents="none">
          <Fill color={theme.bg} />
          {background && (
            <SkiaImage
              image={background}
              x={0}
              y={0}
              width={size.w}
              height={size.h}
              fit="contain"
            />
          )}
          {strokes.map((s, i) => (
            <Path
              key={i}
              path={buildPath(s.points)}
              color={s.color}
              style="stroke"
              strokeWidth={s.width}
              strokeCap="round"
              strokeJoin="round"
            />
          ))}
        </Canvas>
      </View>

      <View style={styles.toolbar}>
        <View style={styles.row}>
          {palette.map((c) => (
            <Pressable
              key={c}
              onPress={() => setColor(c)}
              style={[
                styles.swatch,
                { backgroundColor: c },
                color === c && styles.swatchActive,
              ]}
            />
          ))}
        </View>
        <View style={styles.row}>
          {SIZES.map((s) => (
            <Pressable
              key={s}
              onPress={() => setWidth(s)}
              style={[styles.sizeBtn, width === s && styles.sizeBtnActive]}
            >
              <View
                style={{
                  width: s + 4,
                  height: s + 4,
                  borderRadius: 20,
                  backgroundColor: theme.text,
                }}
              />
            </Pressable>
          ))}
          <Pressable onPress={() => setStrokes((p) => p.slice(0, -1))}>
            <Text style={styles.link}>Undo</Text>
          </Pressable>
          <Pressable onPress={() => setStrokes([])}>
            <Text style={styles.link}>Clear</Text>
          </Pressable>
        </View>
        <Pressable style={styles.saveBtn} onPress={save}>
          <Text style={styles.saveText}>Save to chat</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

function makeStyles(t: Theme) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: t.bar },
    topBar: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      padding: 16,
    },
    title: { fontSize: 22, fontFamily: "Fraunces_900Black", color: t.text },
    link: { fontSize: 17, fontWeight: "700", color: t.text },
    canvasWrap: {
      flex: 1,
      marginHorizontal: 12,
      borderRadius: 20,
      overflow: "hidden",
      backgroundColor: t.bg,
    },
    toolbar: { padding: 16, gap: 14 },
    row: { flexDirection: "row", alignItems: "center", gap: 16 },
    swatch: { width: 34, height: 34, borderRadius: 17 },
    swatchActive: { borderWidth: 3, borderColor: t.bg },
    sizeBtn: {
      width: 40,
      height: 40,
      borderRadius: 20,
      alignItems: "center",
      justifyContent: "center",
    },
    sizeBtnActive: { backgroundColor: t.bg },
    saveBtn: {
      backgroundColor: t.accent,
      borderRadius: 24,
      paddingVertical: 14,
      alignItems: "center",
    },
    saveText: { color: t.onAccent, fontSize: 17, fontWeight: "800" },
  });
}