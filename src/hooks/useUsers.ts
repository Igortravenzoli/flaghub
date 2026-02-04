import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { AppRole } from '@/types/database';

export interface UserWithProfile {
  user_id: string;
  email: string;
  full_name: string | null;
  network_id: number | null;
  network_name: string | null;
  role: AppRole | null;
  created_at: string;
}

export interface Network {
  id: number;
  name: string;
}

export function useUsers() {
  const [users, setUsers] = useState<UserWithProfile[]>([]);
  const [networks, setNetworks] = useState<Network[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Buscar todos os usuários com perfis
  const fetchUsers = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    
    try {
      // Buscar profiles com join em networks e user_roles
      const { data: profiles, error: profilesError } = await supabase
        .from('profiles')
        .select(`
          user_id,
          full_name,
          network_id,
          created_at,
          networks (
            id,
            name
          )
        `)
        .order('created_at', { ascending: false });

      if (profilesError) throw profilesError;

      // Buscar emails dos usuários via função RPC (admin only)
      // Por segurança, vamos buscar roles separadamente
      const { data: roles, error: rolesError } = await supabase
        .from('user_roles')
        .select('user_id, role');

      if (rolesError) throw rolesError;

      // Criar mapa de roles
      const rolesMap = new Map(roles?.map(r => [r.user_id, r.role]) || []);

      // Buscar emails via auth.users (requer permissão admin)
      // Como não temos acesso direto, vamos usar os dados disponíveis
      const usersData: UserWithProfile[] = (profiles || []).map(p => ({
        user_id: p.user_id,
        email: '', // Será preenchido se disponível
        full_name: p.full_name,
        network_id: p.network_id,
        network_name: (p.networks as Network | null)?.name || null,
        role: rolesMap.get(p.user_id) as AppRole || null,
        created_at: p.created_at,
      }));

      setUsers(usersData);
    } catch (err) {
      console.error('Error fetching users:', err);
      setError(err instanceof Error ? err.message : 'Erro ao carregar usuários');
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Buscar redes disponíveis
  const fetchNetworks = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('networks')
        .select('id, name')
        .order('name');

      if (error) throw error;
      setNetworks(data || []);
    } catch (err) {
      console.error('Error fetching networks:', err);
    }
  }, []);

  // Atualizar role do usuário
  const updateUserRole = async (userId: string, newRole: AppRole) => {
    try {
      // Verificar se já existe role
      const { data: existing } = await supabase
        .from('user_roles')
        .select('id')
        .eq('user_id', userId)
        .maybeSingle();

      if (existing) {
        // Atualizar role existente
        const { error } = await supabase
          .from('user_roles')
          .update({ role: newRole })
          .eq('user_id', userId);

        if (error) throw error;
      } else {
        // Criar nova role
        const { error } = await supabase
          .from('user_roles')
          .insert({ user_id: userId, role: newRole });

        if (error) throw error;
      }

      // Atualizar estado local
      setUsers(prev => prev.map(u => 
        u.user_id === userId ? { ...u, role: newRole } : u
      ));

      return { success: true };
    } catch (err) {
      console.error('Error updating role:', err);
      return { 
        success: false, 
        error: err instanceof Error ? err.message : 'Erro ao atualizar role' 
      };
    }
  };

  // Atualizar network do usuário
  const updateUserNetwork = async (userId: string, networkId: number | null) => {
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ network_id: networkId })
        .eq('user_id', userId);

      if (error) throw error;

      // Buscar nome da network
      let networkName: string | null = null;
      if (networkId) {
        const network = networks.find(n => n.id === networkId);
        networkName = network?.name || null;
      }

      // Atualizar estado local
      setUsers(prev => prev.map(u => 
        u.user_id === userId ? { ...u, network_id: networkId, network_name: networkName } : u
      ));

      return { success: true };
    } catch (err) {
      console.error('Error updating network:', err);
      return { 
        success: false, 
        error: err instanceof Error ? err.message : 'Erro ao atualizar rede' 
      };
    }
  };

  // Atualizar nome do usuário
  const updateUserName = async (userId: string, fullName: string) => {
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ full_name: fullName })
        .eq('user_id', userId);

      if (error) throw error;

      setUsers(prev => prev.map(u => 
        u.user_id === userId ? { ...u, full_name: fullName } : u
      ));

      return { success: true };
    } catch (err) {
      console.error('Error updating name:', err);
      return { 
        success: false, 
        error: err instanceof Error ? err.message : 'Erro ao atualizar nome' 
      };
    }
  };

  useEffect(() => {
    fetchUsers();
    fetchNetworks();
  }, [fetchUsers, fetchNetworks]);

  return {
    users,
    networks,
    isLoading,
    error,
    refetch: fetchUsers,
    updateUserRole,
    updateUserNetwork,
    updateUserName,
  };
}
