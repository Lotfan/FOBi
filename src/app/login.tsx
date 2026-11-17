import { useState } from "react";
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Theme } from "../constants/themes";
import { supabase } from "../db/supabase";
import { useTheme } from "../theme/ThemeProvider";

export default function Login() {
  const { theme } = useTheme();
  const styles = makeStyles(theme);

  const [step, setStep] = useState<"email" | "code">("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);

  async function sendCode() {
    const address = email.trim().toLowerCase();
    if (!address.includes("@")) {
      Alert.alert("Enter a valid email address");
      return;
    }
    setBusy(true);
    const { error } = await supabase.auth.signInWithOtp({
      email: address,
      options: { shouldCreateUser: true },
    });
    setBusy(false);
    if (error) Alert.alert("Couldn't send the code", error.message);
    else setStep("code");
  }

  async function verify() {
    setBusy(true);
    const { error } = await supabase.auth.verifyOtp({
      email: email.trim().toLowerCase(),
      token: code.trim(),
      type: "email",
    });
    setBusy(false);
    if (error) Alert.alert("That code didn't work", error.message);
    // On success the app switches to the chat automatically
  }

  return (
    <SafeAreaView style={styles.screen}>
      <KeyboardAvoidingView
        style={styles.center}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <Text style={styles.logo}>Fobi</Text>
        <Text style={styles.tagline}>Just you and your own chat.</Text>

        <View style={styles.card}>
          {step === "email" ? (
            <>
              <Text style={styles.label}>Your email</Text>
              <TextInput
                style={styles.input}
                value={email}
                onChangeText={setEmail}
                placeholder="you@gmail.com"
                placeholderTextColor={theme.muted}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="email-address"
              />
              <Pressable style={styles.btn} onPress={sendCode} disabled={busy}>
                <Text style={styles.btnText}>
                  {busy ? "Sending..." : "Send me a code"}
                </Text>
              </Pressable>
            </>
          ) : (
            <>
              <Text style={styles.label}>
                Enter the code we emailed to {email}
              </Text>
              <TextInput
                style={styles.input}
                value={code}
                onChangeText={setCode}
                placeholder="Code"
                placeholderTextColor={theme.muted}
                keyboardType="number-pad"
                autoFocus
              />
              <Pressable style={styles.btn} onPress={verify} disabled={busy}>
                <Text style={styles.btnText}>
                  {busy ? "Checking..." : "Continue"}
                </Text>
              </Pressable>
              <Pressable onPress={() => setStep("email")}>
                <Text style={styles.link}>Use a different email</Text>
              </Pressable>
            </>
          )}
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function makeStyles(t: Theme) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: t.bar },
    center: { flex: 1, justifyContent: "center", padding: 24 },
    logo: {
      fontSize: 56,
      fontFamily: "Fraunces_900Black",
      color: t.text,
      textAlign: "center",
    },
    tagline: {
      fontSize: 17,
      color: t.text,
      textAlign: "center",
      marginBottom: 32,
    },
    card: {
      backgroundColor: t.bg,
      borderRadius: 24,
      padding: 20,
      gap: 14,
    },
    label: { fontSize: 16, fontWeight: "700", color: t.text },
    input: {
      backgroundColor: t.card,
      borderWidth: 1,
      borderColor: t.muted + "55",
      borderRadius: 16,
      paddingHorizontal: 14,
      paddingVertical: 14,
      fontSize: 17,
      color: t.text,
    },
    btn: {
      backgroundColor: t.accent,
      borderRadius: 24,
      paddingVertical: 14,
      alignItems: "center",
    },
    btnText: { color: t.onAccent, fontSize: 17, fontWeight: "800" },
    link: {
      color: t.text,
      fontWeight: "700",
      textAlign: "center",
      textDecorationLine: "underline",
    },
  });
}