
const { createClient } = require('@supabase/supabase-base');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function checkData() {
  const { data: logs, count: logCount } = await supabase.from('daily_production_logs').select('*', { count: 'exact' });
  const { data: items, count: itemCount } = await supabase.from('production_log_items').select('*', { count: 'exact' });
  const { data: recipes, count: recipeCount } = await supabase.from('recipes').select('*', { count: 'exact' });

  console.log('--- Database Status ---');
  console.log('Daily Production Logs count:', logCount);
  console.log('Production Log Items count:', itemCount);
  console.log('Recipes count:', recipeCount);

  if (logCount > 0) {
    const { data: joinCheck } = await supabase
      .from('daily_production_logs')
      .select('*, production_log_items(*)')
      .limit(1);
    console.log('--- Join Check ---');
    console.log('Log items in sample:', joinCheck?.[0]?.production_log_items?.length);
  }
}

checkData();
