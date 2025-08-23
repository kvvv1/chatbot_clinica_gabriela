const { supabase } = require('./services/supabaseClient');

async function checkTables() {
  console.log('🔍 Verificando estrutura das tabelas no Supabase...');
  
  if (!supabase) {
    console.error('❌ Cliente Supabase não configurado!');
    return;
  }
  
  const requiredTables = [
    'appointment_requests',
    'reschedule_requests', 
    'cancel_requests',
    'waitlist',
    'secretary_tickets',
    'patients',
    'messages',
    'notifications'
  ];
  
  for (const tableName of requiredTables) {
    try {
      console.log(`📋 Verificando tabela: ${tableName}`);
      
      const { data, error } = await supabase
        .from(tableName)
        .select('*')
        .limit(1);
      
      if (error) {
        console.error(`❌ Erro na tabela ${tableName}:`, error.message);
        
        // Sugestões de correção
        if (error.message.includes('relation') && error.message.includes('does not exist')) {
          console.log(`💡 Tabela ${tableName} não existe. Crie-a com a estrutura correta.`);
        } else if (error.message.includes('permission')) {
          console.log(`💡 Problema de permissão na tabela ${tableName}. Verifique as políticas RLS.`);
        }
      } else {
        console.log(`✅ Tabela ${tableName} está acessível`);
        
        // Verificar estrutura básica
        if (data && data.length > 0) {
          const columns = Object.keys(data[0]);
          console.log(`   📊 Colunas encontradas: ${columns.join(', ')}`);
        } else {
          console.log(`   📊 Tabela vazia (sem registros)`);
        }
      }
      
    } catch (error) {
      console.error(`❌ Erro inesperado ao verificar ${tableName}:`, error.message);
    }
    
    console.log(''); // Linha em branco para separar
  }
  
  console.log('🏁 Verificação concluída!');
}

// Executar verificação
checkTables();
