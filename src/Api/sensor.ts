export async function getSensorData() {
  const res = await fetch("http://localhost:3000/sensor")
  return res.json()
}