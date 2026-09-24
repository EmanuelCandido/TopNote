import { Composition } from 'remotion'
import { TopNotePromo } from './TopNotePromo'

export const Root = () => <Composition id="TopNotePromo" component={TopNotePromo} durationInFrames={900} fps={30} width={1600} height={900} />
