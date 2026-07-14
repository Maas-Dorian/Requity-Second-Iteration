// One-off helper: re-encode the founder introduction video to a web-friendly
// H.264 MP4 with a controlled bitrate (macOS has no ffmpeg by default).
// Usage: swift scripts/encode-founder-video.swift <input> <output> [videoKbps]
import AVFoundation
import Foundation

let args = CommandLine.arguments
guard args.count >= 3 else {
  FileHandle.standardError.write("usage: encode-founder-video.swift <input> <output> [videoKbps]\n".data(using: .utf8)!)
  exit(2)
}
let inputURL = URL(fileURLWithPath: args[1])
let outputURL = URL(fileURLWithPath: args[2])
let videoKbps = args.count > 3 ? Int(args[3]) ?? 1800 : 1800

try? FileManager.default.removeItem(at: outputURL)

let asset = AVAsset(url: inputURL)
guard let videoTrack = asset.tracks(withMediaType: .video).first else {
  FileHandle.standardError.write("no video track\n".data(using: .utf8)!)
  exit(1)
}
let audioTrack = asset.tracks(withMediaType: .audio).first

let reader = try! AVAssetReader(asset: asset)
let writer = try! AVAssetWriter(outputURL: outputURL, fileType: .mp4)
writer.shouldOptimizeForNetworkUse = true

let naturalSize = videoTrack.naturalSize
let videoReaderOutput = AVAssetReaderTrackOutput(
  track: videoTrack,
  outputSettings: [kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_420YpCbCr8BiPlanarVideoRange]
)
videoReaderOutput.alwaysCopiesSampleData = false
reader.add(videoReaderOutput)

let videoWriterInput = AVAssetWriterInput(
  mediaType: .video,
  outputSettings: [
    AVVideoCodecKey: AVVideoCodecType.h264,
    AVVideoWidthKey: Int(naturalSize.width),
    AVVideoHeightKey: Int(naturalSize.height),
    AVVideoCompressionPropertiesKey: [
      AVVideoAverageBitRateKey: videoKbps * 1000,
      AVVideoProfileLevelKey: AVVideoProfileLevelH264HighAutoLevel,
      AVVideoMaxKeyFrameIntervalKey: 60,
    ],
  ]
)
videoWriterInput.expectsMediaDataInRealTime = false
videoWriterInput.transform = videoTrack.preferredTransform
writer.add(videoWriterInput)

var audioReaderOutput: AVAssetReaderTrackOutput?
var audioWriterInput: AVAssetWriterInput?
if let audioTrack {
  let out = AVAssetReaderTrackOutput(
    track: audioTrack,
    outputSettings: [AVFormatIDKey: kAudioFormatLinearPCM]
  )
  out.alwaysCopiesSampleData = false
  reader.add(out)
  audioReaderOutput = out

  let input = AVAssetWriterInput(
    mediaType: .audio,
    outputSettings: [
      AVFormatIDKey: kAudioFormatMPEG4AAC,
      AVNumberOfChannelsKey: 2,
      AVSampleRateKey: 44100,
      AVEncoderBitRateKey: 96_000,
    ]
  )
  input.expectsMediaDataInRealTime = false
  writer.add(input)
  audioWriterInput = input
}

guard reader.startReading() else {
  FileHandle.standardError.write("reader failed: \(String(describing: reader.error))\n".data(using: .utf8)!)
  exit(1)
}
guard writer.startWriting() else {
  FileHandle.standardError.write("writer failed: \(String(describing: writer.error))\n".data(using: .utf8)!)
  exit(1)
}
writer.startSession(atSourceTime: .zero)

let group = DispatchGroup()

group.enter()
videoWriterInput.requestMediaDataWhenReady(on: DispatchQueue(label: "video")) {
  while videoWriterInput.isReadyForMoreMediaData {
    if let sample = videoReaderOutput.copyNextSampleBuffer() {
      videoWriterInput.append(sample)
    } else {
      videoWriterInput.markAsFinished()
      group.leave()
      break
    }
  }
}

if let audioReaderOutput, let audioWriterInput {
  group.enter()
  audioWriterInput.requestMediaDataWhenReady(on: DispatchQueue(label: "audio")) {
    while audioWriterInput.isReadyForMoreMediaData {
      if let sample = audioReaderOutput.copyNextSampleBuffer() {
        audioWriterInput.append(sample)
      } else {
        audioWriterInput.markAsFinished()
        group.leave()
        break
      }
    }
  }
}

group.wait()

let done = DispatchSemaphore(value: 0)
writer.finishWriting { done.signal() }
done.wait()

if writer.status == .completed {
  print("ok")
  exit(0)
} else {
  FileHandle.standardError.write("finish failed: \(String(describing: writer.error))\n".data(using: .utf8)!)
  exit(1)
}
