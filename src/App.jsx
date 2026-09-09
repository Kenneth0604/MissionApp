import { Navigate, Route, Routes } from 'react-router-dom'
import { useStore } from './lib/store.jsx'
import Layout from './components/Layout.jsx'
import Login from './pages/Login.jsx'
import Dashboard from './pages/Dashboard.jsx'
import Tasks from './pages/Tasks.jsx'
import TaskForm from './pages/TaskForm.jsx'
import TaskDetail from './pages/TaskDetail.jsx'
import Points from './pages/Points.jsx'
import ComingSoon from './pages/ComingSoon.jsx'

export default function App() {
  const { user } = useStore()

  if (!user) {
    return (
      <Routes>
        <Route path="*" element={<Login />} />
      </Routes>
    )
  }

  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Dashboard />} />
        <Route path="tasks" element={<Tasks />} />
        <Route path="tasks/new" element={<TaskForm />} />
        <Route path="tasks/:id" element={<TaskDetail />} />
        <Route path="tasks/:id/edit" element={<TaskForm />} />
        <Route path="points" element={<Points />} />
        <Route path="rewards" element={<ComingSoon title="獎勵目錄" />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}
