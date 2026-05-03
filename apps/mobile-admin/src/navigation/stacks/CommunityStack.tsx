import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { ContactDetailScreen } from '../../screens/contacts/ContactDetailScreen';
import { ContactsScreen } from '../../screens/contacts/ContactsScreen';
import { DynamicGroupEditorScreen } from '../../screens/members/DynamicGroupEditorScreen';
import { DynamicGroupsScreen } from '../../screens/members/DynamicGroupsScreen';
import { FamiliesScreen } from '../../screens/members/FamiliesScreen';
import { FamilyDetailScreen } from '../../screens/members/FamilyDetailScreen';
import { GradesScreen } from '../../screens/members/GradesScreen';
import { MemberDetailScreen } from '../../screens/members/MemberDetailScreen';
import { MembersDirectoryScreen } from '../../screens/members/MembersDirectoryScreen';
import { MembershipCartDetailScreen } from '../../screens/members/MembershipCartDetailScreen';
import { MembershipCartsScreen } from '../../screens/members/MembershipCartsScreen';
import { NewFamilyScreen } from '../../screens/members/NewFamilyScreen';
import { NewMemberScreen } from '../../screens/members/NewMemberScreen';
import { RolesScreen } from '../../screens/members/RolesScreen';
import type { MembersStackParamList } from '../types';

const Stack = createNativeStackNavigator<MembersStackParamList>();

export function CommunityStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Directory" component={MembersDirectoryScreen} />
      <Stack.Screen name="MemberDetail" component={MemberDetailScreen} />
      <Stack.Screen name="NewMember" component={NewMemberScreen} />
      <Stack.Screen name="Grades" component={GradesScreen} />
      <Stack.Screen name="DynamicGroups" component={DynamicGroupsScreen} />
      <Stack.Screen name="DynamicGroupEditor" component={DynamicGroupEditorScreen} />
      <Stack.Screen name="Roles" component={RolesScreen} />
      <Stack.Screen name="Families" component={FamiliesScreen} />
      <Stack.Screen name="FamilyDetail" component={FamilyDetailScreen} />
      <Stack.Screen name="NewFamily" component={NewFamilyScreen} />
      <Stack.Screen name="Contacts" component={ContactsScreen} />
      <Stack.Screen name="ContactDetail" component={ContactDetailScreen} />
      <Stack.Screen name="MembershipCarts" component={MembershipCartsScreen} />
      <Stack.Screen name="MembershipCartDetail" component={MembershipCartDetailScreen} />
    </Stack.Navigator>
  );
}
