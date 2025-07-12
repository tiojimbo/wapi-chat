const SupabaseService = require('../services/supabase/SupabaseService');

// Exportar o cliente do Supabase para compatibilidade
const supabase = SupabaseService.getClient();

module.exports = supabase; 