require "json"

package = JSON.parse(File.read(File.join(__dir__, "package.json")))

Pod::Spec.new do |s|
  s.name         = "streampulse"
  s.version      = package["version"]
  s.summary      = package["description"]
  s.homepage     = "https://github.com/streampulse/streampulse"
  s.license      = "MIT"
  s.authors      = { "StreamPulse" => "contact@streampulse.dev" }
  s.platforms    = { :ios => "15.0" }
  s.source       = { :git => "https://github.com/streampulse/streampulse.git", :tag => "#{s.version}" }

  s.source_files = "ios/**/*.{h,m,mm,swift}"
  s.dependency "React-Core"
end
