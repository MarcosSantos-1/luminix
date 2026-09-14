import { View, Text, TouchableOpacity } from 'react-native';
import { ReactNode } from 'react';

interface CardProps {
  children: ReactNode;
  title?: string;
  onPress?: () => void;
  className?: string;
}

export function Card({ children, title, onPress, className = '' }: CardProps) {
  const baseClasses = 'bg-white rounded-2xl p-6 shadow-sm border border-gray-100';
  
  const content = (
    <View className={`${baseClasses} ${className}`}>
      {title && (
        <Text className="text-xl font-bold text-gray-800 mb-4">
          {title}
        </Text>
      )}
      {children}
    </View>
  );

  if (onPress) {
    return (
      <TouchableOpacity onPress={onPress} activeOpacity={0.7}>
        {content}
      </TouchableOpacity>
    );
  }

  return content;
}


