import RoomClient from './RoomClient';

export default function RoomPage({ params }: { params: { roomId: string } }) {
  return <RoomClient roomId={params.roomId} />;
}
