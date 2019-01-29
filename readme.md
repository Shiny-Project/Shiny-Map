# Shiny 地图渲染装置

## 技术选择

本项目起初试图采用`basemap`进行地图绘制，在实践中发现`basemap`无法对同一地图实例进行重定位。然而`basemap`地图实例初始化、读入`shapefile`时间长，在无法复用地图实例的情况下，难以满足性能需求。

故目前采用`openlayers`进行地图渲染，并采用`Chrome Headless`进行截图，在复用浏览器实例的情况下，可以将成品图生成时间降低到1s内。

## API

高亮城市 

`GET /Map/highlight`

对中国大陆的城市进行高亮标识。

**参数**

| 参数名 | 参数类型 | 参数说明 |
| ----  | ----     | --------|
| center | string | 作为地图中心的省份名 |
| cities | string[] | 需要高亮的城市 |

对任何含有省份或城市名的参数，请使用完整官方名称。

**支持省份**

| # | 省名 | 
| ----  | ----   
| 1 | 浙江省
| 2 | 上海市
| 3 | 江苏省

☆对于直辖市无法细分

未来可能支持更多。

由于地图数据政治不正确，我们无法对西南某些省份提供支持。对于这些省份，返回`HTTP 451`。

**示例**

`GET /Map/highlight?center=浙江省&cities=["杭州市", "宁波市"]`

------

震度速报

`POST /Map/shindo_early_report`


**参数**

| 参数名 | 参数类型 | 参数说明 |
| ----  | ----     | --------|
| shindo | object | 震度信息 |

对 `shindo` 参数详细定义如下：

```JavaScript
const shindo = {
    "1": ["震度1的地区"],
    "2": ["震度2的地区"],
    "3": ["震度3的地区"],
    "4": ["震度4的地区"],
    "5-": ["震度5-的地区"],
    "5+": ["震度5+的地区"],
    "6-": ["震度6-的地区"],
    "6+": ["震度6+的地区"],
    "7": ["震度7的地区"],
}
```

其中地区名按照 JMA 震度速报[规范](https://www.data.jma.go.jp/svd/eqev/data/joho/shindo-name.html)规定的地域名填写。

* 数字使用全角数字。例如：`東京都２３区`。

**预览**
![](https://wx3.sinaimg.cn/large/005BvSosly1fzk2epf0jnj31hc0u0dk8.jpg)

----

各地区震度信息

`POST /Map/shindo_report`

**参数**

| 参数名 | 参数类型 | 参数说明 |
| ----  | ----     | --------|
| epicenter | number[] | 震中经纬度 |
| shindo | object | 震度信息 |

定义同上

震中经纬度`epicenter`应为两个浮点数组成的数组。示例：`[140.113, 23.019]`。

其中地区名按照 JMA 各地区震度信息规范规定的地域名填写。

相关规范请参考：

[気象庁防災情報XMLフォーマット　技術資料](http://xml.kishou.go.jp/tec_material.html)

地震火山関連コード表.xls -> Sheet 24 (AreaForecastLocalE ・ AreaInformationCity ・ PointSeismicIntensity コード表)

**预览**
![](https://wx3.sinaimg.cn/large/005BvSosly1fzk2gsycnoj31hc0u0wkn.jpg)

----

海啸警报

`POST /Map/tsunami_warning`

**参数**

| 参数名 | 参数类型 | 参数说明 |
| ----  | ----     | --------|
| warning | object | 警报信息 |

对警报信息详细定义如下
```JavaScript
const warning = {
    "notice": ["京都府"], // 海啸注意报的区域
    "warning": ["有明・八代海"], // 海啸警报的区域
    "alert": ["千葉県九十九里・外房"] // 大海啸警报的区域
}
```
其中区域名按照 JMA 规定的海啸警报区域名填写。

**预览**
![](http://ww1.sinaimg.cn/large/e985a6f7ly1fzne8i260kj21hc0u07bl.jpg)

## Special Thanks

我们感谢 @9SQ 开源的震度图生产样例及坐标数据。（ https://github.com/9SQ/seismic-intensity-map ）

We would like to give a special thank to seismic intensity map demo and geographic coordinates which is open sourced by @9SQ.

我们同样需要感谢 Gehirn 和他们旗下的社交网络账号 @UN_NERV 为我们提供了参考和灵感。

Thanks for Gehirn Inc., and their SNS account @UN_NERV who provide much references and inspiration for us.