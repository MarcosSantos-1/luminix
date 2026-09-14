import { TouchableOpacity, Text, ActivityIndicator } from 'react-native';

interface ButtonProps {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'outline';
  isLoading?: boolean;
  disabled?: boolean;
}

export function Button({ 
  title, 
  onPress, 
  variant = 'primary',
  isLoading = false,
  disabled = false 
}: ButtonProps) {
  const variants = {
    primary: 'bg-pink-500 active:bg-pink-600',
    secondary: 'bg-gray-500 active:bg-gray-600',
    outline: 'bg-white border-2 border-pink-500 active:bg-pink-50'
  };

  const textVariants = {
    primary: 'text-white',
    secondary: 'text-white',
    outline: 'text-pink-500'
  };

  const baseClasses = 'p-4 rounded-xl items-center justify-center';
  const disabledClasses = disabled || isLoading ? 'opacity-50' : '';

  return (
    <TouchableOpacity
      className={`${baseClasses} ${variants[variant]} ${disabledClasses}`}
      onPress={onPress}
      disabled={disabled || isLoading}
      activeOpacity={0.7}
    >
      {isLoading ? (
        <ActivityIndicator color={variant === 'outline' ? '#ec4899' : 'white'} />
      ) : (
        <Text className={`${textVariants[variant]} text-center font-bold text-lg`}>
          {title}
        </Text>
      )}
    </TouchableOpacity>
  );
}


