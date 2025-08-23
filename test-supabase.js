const { supabase } = require('./services/supabaseClient');

async function testSupabaseConnection() {
  console.log('🧪 Testando conexão com Supabase...');
  
  if (!supabase) {
    console.error('❌ Cliente Supabase não configurado!');
    console.log('Verifique as variáveis de ambiente:');
    console.log('- SUPABASE_URL');
    console.log('- SUPABASE_SERVICE_ROLE_KEY');
    console.log('- SUPABASE_ANON_KEY');
    return;
  }
  
  try {
    // Teste 1: Verificar se consegue acessar a tabela
    console.log('📋 Testando acesso à tabela appointment_requests...');
    const { data: testData, error: testError } = await supabase
      .from('appointment_requests')
      .select('count', { count: 'exact', head: true });
    
    if (testError) {
      console.error('❌ Erro ao acessar tabela:', testError.message);
      return;
    }
    
    console.log('✅ Tabela acessível. Total de registros:', testData?.count || 0);
    
    // Teste 2: Tentar inserir um registro de teste
    console.log('📝 Testando inserção de agendamento...');
    const testAppointment = {
      cpf: '12345678901',
      phone: '5511999999999',
      requested_date: '25/12/2024',
      requested_time: '14:00',
      tipo: 'Teste de Conexão',
      status: 'pending'
    };
    
    const { data: insertData, error: insertError } = await supabase
      .from('appointment_requests')
      .insert(testAppointment)
      .select();
    
    if (insertError) {
      console.error('❌ Erro ao inserir teste:', insertError.message);
      return;
    }
    
    console.log('✅ Inserção bem-sucedida! ID:', insertData?.[0]?.id);
    
    // Teste 3: Verificar se o registro foi inserido
    const { data: verifyData, error: verifyError } = await supabase
      .from('appointment_requests')
      .select('*')
      .eq('cpf', '12345678901')
      .eq('tipo', 'Teste de Conexão')
      .limit(1);
    
    if (verifyError) {
      console.error('❌ Erro ao verificar inserção:', verifyError.message);
      return;
    }
    
    if (verifyData && verifyData.length > 0) {
      console.log('✅ Registro verificado com sucesso:', verifyData[0]);
    } else {
      console.log('⚠️ Registro não encontrado após inserção');
    }
    
    // Teste 4: Limpar registro de teste
    console.log('🧹 Limpando registro de teste...');
    const { error: deleteError } = await supabase
      .from('appointment_requests')
      .delete()
      .eq('tipo', 'Teste de Conexão');
    
    if (deleteError) {
      console.error('❌ Erro ao limpar teste:', deleteError.message);
    } else {
      console.log('✅ Registro de teste removido');
    }
    
    console.log('🎉 Todos os testes passaram! Supabase está funcionando corretamente.');
    
  } catch (error) {
    console.error('❌ Erro geral no teste:', error.message);
    console.error('Stack trace:', error.stack);
  }
}

// Executar teste
testSupabaseConnection();
