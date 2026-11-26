import { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { RipplePressable } from '@/components/ripple-pressable';
import { useAuth } from '@/features/auth/auth-context';
import { useThemeColors } from '@/theme/colors';

export default function LoginScreen() {
  const colors = useThemeColors();
  const { login } = useAuth();

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit() {
    if (submitting) {
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      await login(username, password);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка входа');
    } finally {
      setSubmitting(false);
    }
  }

  const canSubmit = username.trim().length > 0 && password.length > 0 && !submitting;

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={[styles.screen, { backgroundColor: colors.background }]}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled">
        <View
          style={[
            styles.card,
            { backgroundColor: colors.surface, borderColor: colors.line },
          ]}>
          <View style={styles.header}>
            <Text style={[styles.title, { color: colors.text }]}>Sotaq</Text>
            <Text style={[styles.subtitle, { color: colors.muted }]}>
              Войдите под своим локальным аккаунтом
            </Text>
          </View>

          <View style={styles.form}>
            <View style={styles.field}>
              <Text style={[styles.label, { color: colors.muted }]}>Логин</Text>
              <TextInput
                value={username}
                onChangeText={setUsername}
                autoCapitalize="none"
                autoCorrect={false}
                placeholder="Логин"
                placeholderTextColor={colors.muted}
                style={[
                  styles.input,
                  {
                    color: colors.text,
                    backgroundColor: colors.surfaceSubtle,
                    borderColor: colors.line,
                  },
                ]}
              />
            </View>

            <View style={styles.field}>
              <Text style={[styles.label, { color: colors.muted }]}>Пароль</Text>
              <TextInput
                value={password}
                onChangeText={setPassword}
                onSubmitEditing={handleSubmit}
                secureTextEntry
                placeholder="Пароль"
                placeholderTextColor={colors.muted}
                returnKeyType="done"
                style={[
                  styles.input,
                  {
                    color: colors.text,
                    backgroundColor: colors.surfaceSubtle,
                    borderColor: colors.line,
                  },
                ]}
              />
            </View>

            {error ? (
              <View style={[styles.errorBox, { backgroundColor: colors.dangerBg }]}>
                <Text style={[styles.errorText, { color: colors.danger }]}>{error}</Text>
              </View>
            ) : null}

            <RipplePressable
              disabled={!canSubmit}
              onPress={handleSubmit}
              style={StyleSheet.flatten([
                styles.submitBtn,
                { backgroundColor: colors.accent },
                !canSubmit ? styles.submitDisabled : null,
              ])}>
              {submitting ? (
                <ActivityIndicator size="small" color={colors.accentText} />
              ) : (
                <Text style={[styles.submitLabel, { color: colors.accentText }]}>Войти</Text>
              )}
            </RipplePressable>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  card: {
    width: '100%',
    maxWidth: 400,
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 24,
    gap: 20,
  },
  header: {
    gap: 6,
  },
  title: {
    fontSize: 30,
    fontWeight: '700',
    letterSpacing: -0.7,
  },
  subtitle: {
    fontSize: 14,
    lineHeight: 20,
  },
  form: {
    gap: 14,
  },
  field: {
    gap: 6,
  },
  label: {
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  input: {
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 13,
    paddingVertical: 11,
    fontSize: 15,
  },
  errorBox: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
  },
  errorText: {
    fontSize: 13,
    fontWeight: '600',
  },
  submitBtn: {
    marginTop: 4,
    borderRadius: 12,
    paddingVertical: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitDisabled: {
    opacity: 0.4,
  },
  submitLabel: {
    fontSize: 15,
    fontWeight: '600',
  },
});
