from PIL import Image
im = Image.open(r"qa/layout/980-cold.png")
print("screenshot", im.size)
im.crop((60, 1000, 700, 1330)).resize((1280, 660), Image.LANCZOS).save(r"qa/layout/zoom-persat.png")
im.crop((520, 1080, 1000, 1400)).resize((960, 640), Image.LANCZOS).save(r"qa/layout/zoom-ttff.png")
print("zooms saved")
