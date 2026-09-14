import { ReactNode } from 'react';
import {
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleProp,
  StyleSheet,
  View,
  ViewStyle,
  type ScrollViewProps,
} from 'react-native';

export function dismissKeyboard() {
  Keyboard.dismiss();
}

type KeyboardFormProps = {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  contentContainerStyle?: StyleProp<ViewStyle>;
  /** Sticky footer rendered below the scroll area, still above the keyboard. */
  footer?: ReactNode;
  /** Extra offset for headers / navigation bars (iOS). */
  keyboardVerticalOffset?: number;
  scrollProps?: ScrollViewProps;
};

/**
 * Lifts sticky footers above the keyboard without auto-scrolling inputs.
 * iOS: KeyboardAvoidingView padding.
 * Android: relies on window resize (softwareKeyboardLayoutMode: "resize").
 * The user scrolls the form manually.
 */
export function KeyboardForm({
  children,
  style,
  contentContainerStyle,
  footer,
  keyboardVerticalOffset = 0,
  scrollProps,
}: KeyboardFormProps) {
  const body = (
    <>
      <ScrollView
        style={styles.flex}
        contentContainerStyle={[styles.content, contentContainerStyle]}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
        showsVerticalScrollIndicator={false}
        bounces
        nestedScrollEnabled
        {...scrollProps}
      >
        {children}
      </ScrollView>
      {footer ? <View style={styles.footer}>{footer}</View> : null}
    </>
  );

  if (Platform.OS === 'ios') {
    return (
      <KeyboardAvoidingView
        style={[styles.flex, style]}
        behavior="padding"
        keyboardVerticalOffset={keyboardVerticalOffset}
      >
        {body}
      </KeyboardAvoidingView>
    );
  }

  return <View style={[styles.flex, style]}>{body}</View>;
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { flexGrow: 1 },
  footer: { flexShrink: 0 },
});
