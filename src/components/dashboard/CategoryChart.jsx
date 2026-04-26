import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from 'recharts';

const COLORS = ['#2D336B', '#7886C7', '#A9B5DF', '#FFF2F2', '#3F478B', '#8E9BD3', '#C6CEE8', '#FFE0E0'];

const LABELS = {
  food: 'Food',
  medical: 'Medical',
  shelter: 'Shelter',
  education: 'Education',
  mental_health: 'Mental Health',
  elderly_care: 'Elderly Care',
  childcare: 'Childcare',
  transportation: 'Transport',
  other: 'Other',
};

export default function CategoryChart({ needs = [] }) {
  const counts = {};
  needs.forEach(n => {
    const cat = n.category || 'other';
    counts[cat] = (counts[cat] || 0) + 1;
  });

  const data = Object.entries(counts).map(([key, value]) => ({
    name: LABELS[key] || key,
    value,
  }));

  if (data.length === 0) {
    return (
      <div className="bg-card/95 rounded-xl border border-servex-periwinkle/70 p-5 shadow-sm">
        <h3 className="font-semibold font-jakarta text-foreground mb-4">Needs by Category</h3>
        <div className="flex items-center justify-center h-40 text-muted-foreground text-sm">No data yet</div>
      </div>
    );
  }

  return (
    <div className="bg-card/95 rounded-xl border border-servex-periwinkle/70 p-5 shadow-sm">
      <h3 className="font-semibold font-jakarta text-foreground mb-4">Needs by Category</h3>
      <ResponsiveContainer width="100%" height={220}>
        <PieChart>
          <Pie data={data} cx="50%" cy="50%" innerRadius={55} outerRadius={80} paddingAngle={3} dataKey="value">
            {data.map((_, index) => (
              <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
            ))}
          </Pie>
          <Tooltip
            formatter={(v) => [v, 'needs']}
            contentStyle={{
              backgroundColor: '#FFF2F2',
              border: '1px solid #A9B5DF',
              borderRadius: '8px',
              color: '#2D336B',
            }}
          />
          <Legend iconType="circle" iconSize={8} />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}
