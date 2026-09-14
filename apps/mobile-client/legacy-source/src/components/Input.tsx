import { View, Text, TextInput, TextInputProps } from 'react-native';
import { dismissKeyboard } from './KeyboardForm';

interface InputProps extends TextInputProps {
  label?: string;
  error?: string;
  icon?: string;
}

export function Input({
  label,
  error,
  icon,
  onSubmitEditing,
  returnKeyType,
  blurOnSubmit,
  multiline,
  ...props
}: InputProps) {
  return (
    <View className="mb-4">
      {label && (
        <Text className="text-gray-700 font-semibold mb-2 text-base">
          {label}
        </Text>
      )}
      <View className="relative">
        {icon && (
          <View className="absolute left-4 top-0 bottom-0 justify-center z-10">
            <Text className="text-xl">{icon}</Text>
          </View>
        )}
        <TextInput
          className={`
            bg-white border-2 rounded-xl p-4 text-base
            ${icon ? 'pl-12' : ''}
            ${error ? 'border-red-500' : 'border-gray-200'}
            focus:border-pink-500
          `}
          placeholderTextColor="#9CA3AF"
          multiline={multiline}
          returnKeyType={returnKeyType ?? (multiline ? 'default' : 'done')}
          blurOnSubmit={blurOnSubmit ?? !multiline}
          onSubmitEditing={onSubmitEditing ?? (multiline ? undefined : dismissKeyboard)}
          {...props}
        />
      </View>
      {error && (
        <Text className="text-red-500 text-sm mt-1 ml-1">
          {error}
        </Text>
      )}
    </View>
  );
}
