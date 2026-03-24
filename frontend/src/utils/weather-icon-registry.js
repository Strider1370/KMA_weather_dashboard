import brokenClouds from "../assets/weather-icons/basmilius/broken-clouds.svg";
import clearDay from "../assets/weather-icons/basmilius/clear-day.svg";
import clearNight from "../assets/weather-icons/basmilius/clear-night.svg";
import fewCloudsDay from "../assets/weather-icons/basmilius/few-clouds-day.svg";
import fewCloudsNight from "../assets/weather-icons/basmilius/few-clouds-night.svg";
import fogDay from "../assets/weather-icons/basmilius/fog-day.svg";
import fogNight from "../assets/weather-icons/basmilius/fog-night.svg";
import freezingRain from "../assets/weather-icons/basmilius/freezing-rain.svg";
import hail from "../assets/weather-icons/basmilius/hail.svg";
import hazeDay from "../assets/weather-icons/basmilius/haze-day.svg";
import hazeNight from "../assets/weather-icons/basmilius/haze-night.svg";
import overcast from "../assets/weather-icons/basmilius/overcast.svg";
import rainDay from "../assets/weather-icons/basmilius/rain-day.svg";
import rainNight from "../assets/weather-icons/basmilius/rain-night.svg";
import scatteredCloudsDay from "../assets/weather-icons/basmilius/scattered-clouds-day.svg";
import scatteredCloudsNight from "../assets/weather-icons/basmilius/scattered-clouds-night.svg";
import severeWind from "../assets/weather-icons/basmilius/severe-wind.svg";
import showersDay from "../assets/weather-icons/basmilius/showers-day.svg";
import showersNight from "../assets/weather-icons/basmilius/showers-night.svg";
import snowDay from "../assets/weather-icons/basmilius/snow-day.svg";
import snowNight from "../assets/weather-icons/basmilius/snow-night.svg";
import thunderstormDay from "../assets/weather-icons/basmilius/thunderstorm-day.svg";
import thunderstormNight from "../assets/weather-icons/basmilius/thunderstorm-night.svg";
import unknown from "../assets/weather-icons/basmilius/unknown.svg";

export const WEATHER_ICON_REGISTRY = {
  "broken-clouds": brokenClouds,
  "clear-day": clearDay,
  "clear-night": clearNight,
  "few-clouds-day": fewCloudsDay,
  "few-clouds-night": fewCloudsNight,
  "fog-day": fogDay,
  "fog-night": fogNight,
  "freezing-rain": freezingRain,
  hail,
  "haze-day": hazeDay,
  "haze-night": hazeNight,
  overcast,
  "rain-day": rainDay,
  "rain-night": rainNight,
  "scattered-clouds-day": scatteredCloudsDay,
  "scattered-clouds-night": scatteredCloudsNight,
  "severe-wind": severeWind,
  "showers-day": showersDay,
  "showers-night": showersNight,
  "snow-day": snowDay,
  "snow-night": snowNight,
  "thunderstorm-day": thunderstormDay,
  "thunderstorm-night": thunderstormNight,
  unknown
};

export function getWeatherIconSrc(iconId) {
  return WEATHER_ICON_REGISTRY[iconId] || WEATHER_ICON_REGISTRY.unknown;
}
