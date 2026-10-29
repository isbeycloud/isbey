import React from 'react';
import type { User } from '../../../types';
import { UserAccountDialog } from '../../common/UserAccountsPanel';
export const PasswordResetModal: React.FC<{isOpen:boolean;onClose:()=>void;user:User|null}> = ({isOpen,onClose,user}) => <UserAccountDialog isOpen={isOpen && !!user} userId={user?.id} initialMode="EMAIL" onClose={onClose} />;
