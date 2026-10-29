import React from 'react';
import { Modal } from './Modal';
import { UserAccountsPanel } from './UserAccountsPanel';
export const UserManagementModal: React.FC<{isOpen:boolean;onClose:()=>void}> = ({isOpen,onClose}) => <Modal isOpen={isOpen} onClose={onClose} title="Kullanıcı Hesapları" size="full"><UserAccountsPanel /></Modal>;
