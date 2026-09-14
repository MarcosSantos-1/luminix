import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { ClientStackParamList } from '../../../navigation/ClientNavigator';
import { useAuth } from '../../../contexts/AuthContext';
import { AnamnesisFlow } from '../../anamnesis/AnamnesisFlow';

type Props = NativeStackScreenProps<ClientStackParamList, 'AnamnesisBridge'>;

/** Stack entry used when booking requires anamnesis. */
export function AnamnesisBridgeScreen({ navigation, route }: Props) {
  const { user } = useAuth();
  if (!user) return null;
  return (
    <AnamnesisFlow
      user={user}
      onComplete={() => {
        if (route.params?.serviceId) {
          navigation.replace('Booking', {
            serviceId: route.params.serviceId,
            appointmentId: route.params.appointmentId,
          });
        } else {
          navigation.goBack();
        }
      }}
    />
  );
}
