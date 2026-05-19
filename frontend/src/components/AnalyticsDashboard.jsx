import React, { useEffect, useState } from 'react';
import {
    PieChart, Pie, Cell,
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
    LineChart, Line
} from 'recharts';
import api from '../services/api';

const COLORS = ['#22c55e', '#ef4444', '#3b82f6', '#f59e0b'];

const AnalyticsDashboard = ({ role = 'ADMIN', userId = null }) => {
    const [data, setData] = useState(null);
    const [userHistory, setUserHistory] = useState([]);
    const [loading, setLoading] = useState(true);

    const fetchOverview = async () => {
        try {
            const endpoint = '/admin/attendance/analytics/overview';
            const res = await api.get(endpoint);
            setData(res.data);
        } catch (err) {
            console.error('Failed to fetch analytics overview', err);
        }
    };

    const fetchUserHistory = async (id) => {
        try {
            const res = await api.get(`/admin/attendance/analytics/user/${id}`);
            setUserHistory(res.data);
        } catch (err) {
            console.error('Failed to fetch user history', err);
        }
    };

    useEffect(() => {
        const init = async () => {
            setLoading(true);
            await fetchOverview();
            if (userId) {
                await fetchUserHistory(userId);
            }
            setLoading(false);
        };
        init();
    }, [role, userId]);

    if (loading) return <div className="muted" style={{ padding: '2rem', textAlign: 'center' }}>Loading Analytics...</div>;
    if (!data) return <div className="error">Failed to load analytics data.</div>;

    const pieData = [
        { name: 'Present', value: data.presence.present },
        { name: 'Absent', value: data.presence.absent },
    ];

    return (
        <div className="analytics-container fade-in">
            <div className="layout-grid">
                {/* Presence Today Pie Chart */}
                <div className="card">
                    <h3 style={{ marginBottom: '1.5rem', textAlign: 'center' }}>Presence Today</h3>
                    <div style={{ height: 300 }}>
                        <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                                <Pie
                                    data={pieData}
                                    cx="50%"
                                    cy="50%"
                                    innerRadius={60}
                                    outerRadius={80}
                                    paddingAngle={5}
                                    dataKey="value"
                                    label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                                >
                                    {pieData.map((entry, index) => (
                                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                    ))}
                                </Pie>
                                <Tooltip />
                                <Legend verticalAlign="bottom" height={36} />
                            </PieChart>
                        </ResponsiveContainer>
                    </div>
                    <p className="muted small" style={{ textAlign: 'center', marginTop: '1rem' }}>
                        Total Employees: {data.presence.total}
                    </p>
                </div>

                {/* Hourly Check-in Trend Bar Chart */}
                <div className="card">
                    <h3 style={{ marginBottom: '1.5rem', textAlign: 'center' }}>Peak Check-in Hours</h3>
                    <div style={{ height: 300 }}>
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={data.hourlyTrend}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                                <XAxis dataKey="hour" fontSize={12} tickLine={false} axisLine={false} />
                                <YAxis fontSize={12} tickLine={false} axisLine={false} />
                                <Tooltip cursor={{ fill: '#f8fafc' }} />
                                <Bar dataKey="count" fill="#3b82f6" radius={[4, 4, 0, 0]} barSize={30} />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </div>
            </div>

            {/* User Specific History (Only for Admin when a user is selected) */}
            {userId && userHistory.length > 0 && (
                <div className="card full-width" style={{ marginTop: '1.25rem' }}>
                    <h3 style={{ marginBottom: '1.5rem' }}>Working Hours History</h3>
                    <div style={{ height: 350 }}>
                        <ResponsiveContainer width="100%" height="100%">
                            <LineChart data={userHistory}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                                <XAxis dataKey="date" fontSize={12} tickLine={false} axisLine={false} />
                                <YAxis fontSize={12} tickLine={false} axisLine={false} label={{ value: 'Hours', angle: -90, position: 'insideLeft', fontSize: 12 }} />
                                <Tooltip />
                                <Legend />
                                <Line
                                    type="monotone"
                                    dataKey="hours"
                                    stroke="#4f46e5"
                                    strokeWidth={3}
                                    dot={{ r: 4, fill: '#4f46e5' }}
                                    activeDot={{ r: 6 }}
                                    animationDuration={1500}
                                />
                            </LineChart>
                        </ResponsiveContainer>
                    </div>
                </div>
            )}

            {!userId && role === 'ADMIN' && (
                <div className="notice" style={{ marginTop: '1.25rem' }}>
                    💡 Tip: Click on a specific employee below (future feature) to see their individual history.
                </div>
            )}
        </div>
    );
};

export default AnalyticsDashboard;
