import { Navigate, Route, Routes } from 'react-router-dom'
import { useStore } from './lib/store.jsx'
import Layout from './components/Layout.jsx'
import Login from './pages/Login.jsx'
import Dashboard from './pages/Dashboard.jsx'
import Tasks from './pages/Tasks.jsx'
import TaskForm from './pages/TaskForm.jsx'
import TaskDetail from './pages/TaskDetail.jsx'
import Points from './pages/Points.jsx'
import Rewards from './pages/Rewards.jsx'
import RewardForm from './pages/RewardForm.jsx'
import Redemptions from './pages/Redemptions.jsx'
import Settings from './pages/Settings.jsx'
import SetupNeeded from './pages/SetupNeeded.jsx'
import Splash from './components/Splash.jsx'

export default function App() {
  const { configured, authLoading, authUser, ready, fatal, logout } = useStore()

  if (!configured) return <SetupNeeded />
  if (authLoading) return <Splash />

  if (!authUser) {
    return (
      <Routes>
        <Route path="*" element={<Login />} />
      </Routes>
    )
  }

  if (fatal) return <Splash error={fatal} onLogout={logout} />
  if (!ready) return <Splash />

  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Dashboard />} />
        <Route path="tasks" element={<Tasks />} />
        <Route path="tasks/new" element={<TaskForm />} />
        <Route path="tasks/:id" element={<TaskDetail />} />
        <Route path="tasks/:id/edit" element={<TaskForm />} />
        <Route path="points" element={<Points />} />
        <Route path="rewards" element={<Rewards />} />
        <Route path="rewards/new" element={<RewardForm />} />
        <Route path="rewards/:id/edit" element={<RewardForm />} />
        <Route path="redemptions" element={<Redemptions />} />
        <Route path="settings" element={<Settings />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}
